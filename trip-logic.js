/**
 * Pure trip logic for the Hong Kong trip board.
 * No DOM access here, so every function behaves the same in the browser and under `node --test`.
 * Exposed as `module.exports` in Node and as `window.TripLogic` in the page.
 */
(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  } else {
    root.TripLogic = api;
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const MS_PER_MINUTE = 60000;
  const MINUTES_PER_HOUR = 60;
  const HOURS_PER_DAY = 24;
  /** A countdown shows whole days from two days out, and whole hours from six hours out. */
  const WHOLE_DAYS_FROM = 2;
  const WHOLE_HOURS_FROM = 6;
  const NOW = 'Now';
  const MAX_QUERY_LENGTH = 80;
  const ALL_FILTER = 'all';
  const COMBINING_MARKS = /[̀-ͯ]/g;

  /**
   * @typedef {{ id: string, label: string, startIso: string }} TripEvent
   * @typedef {{ id: string, startIso: string, endIso: string }} TripDay
   * @typedef {{ days: number, hours: number, minutes: number }} CountdownParts
   */

  /**
   * Reads an ISO date-time with an offset as an absolute instant.
   * @param {unknown} iso
   * @returns {number | null} milliseconds since the epoch, or null when unreadable
   */
  function toInstant(iso) {
    const ms = typeof iso === 'string' ? Date.parse(iso) : Number.NaN;
    return Number.isFinite(ms) ? ms : null;
  }

  /**
   * Finds the next event on the plan. Events with unreadable times are skipped.
   * @param {number} nowMs
   * @param {TripEvent[]} events
   * @returns {{ state: 'before' | 'during' | 'after', event: TripEvent | null, msUntil: number }}
   */
  function nextUp(nowMs, events) {
    const timed = (Array.isArray(events) ? events : [])
      .map((event) => ({ event, startMs: toInstant(event && event.startIso) }))
      .filter((entry) => entry.startMs !== null)
      .sort((first, second) => first.startMs - second.startMs);
    const upcoming = timed.find((entry) => entry.startMs > nowMs);
    if (!upcoming) {
      return { state: 'after', event: null, msUntil: 0 };
    }
    const state = nowMs < timed[0].startMs ? 'before' : 'during';
    return { state, event: upcoming.event, msUntil: upcoming.startMs - nowMs };
  }

  /**
   * Splits a duration into whole days, hours and minutes. Never negative.
   * @param {number} ms
   * @returns {CountdownParts}
   */
  function countdownParts(ms) {
    const totalMinutes = Number.isFinite(ms) && ms > 0 ? Math.floor(ms / MS_PER_MINUTE) : 0;
    const totalHours = Math.floor(totalMinutes / MINUTES_PER_HOUR);
    return {
      days: Math.floor(totalHours / HOURS_PER_DAY),
      hours: totalHours % HOURS_PER_DAY,
      minutes: totalMinutes % MINUTES_PER_HOUR,
    };
  }

  /**
   * Writes countdown parts as the text shown on the board, in words, never with a zero unit:
   * "9 days", "31 hours", "2 hours 40 minutes", "45 minutes", then "Now".
   * @param {CountdownParts} parts
   * @returns {string}
   */
  function countdownText(parts) {
    const { days, hours, minutes } = parts;
    const totalHours = days * HOURS_PER_DAY + hours;
    if (days >= WHOLE_DAYS_FROM) {
      return counted(days, 'day');
    }
    if (totalHours >= WHOLE_HOURS_FROM) {
      return counted(totalHours, 'hour');
    }
    if (totalHours > 0) {
      return minutes > 0 ? `${counted(totalHours, 'hour')} ${counted(minutes, 'minute')}` : counted(totalHours, 'hour');
    }
    return minutes > 0 ? counted(minutes, 'minute') : NOW;
  }

  /**
   * Writes the line under the countdown. While time remains it reads "Until <event>.";
   * in the last minute, when the figure reads "Now", it names the event alone.
   * @param {unknown} label the event, for example "FKJ starts"
   * @param {string} figure the countdown text from countdownText
   * @returns {string}
   */
  function countdownCaption(label, figure) {
    const event = typeof label === 'string' ? label.trim() : '';
    if (event === '') {
      return '';
    }
    return figure === NOW ? `${event.charAt(0).toUpperCase()}${event.slice(1)}.` : `Until ${event}.`;
  }

  /**
   * @param {number} count
   * @param {string} unit a singular unit, for example "hour"
   * @returns {string} "1 hour", "3 hours"
   */
  function counted(count, unit) {
    return `${count} ${unit}${count === 1 ? '' : 's'}`;
  }

  /**
   * Picks the day tab to open: the current day, else the first day before the trip, else the last.
   * @param {number} nowMs
   * @param {TripDay[]} days
   * @returns {string} a day id, or an empty string when there are no days
   */
  function activeDayId(nowMs, days) {
    const list = Array.isArray(days) ? days : [];
    if (list.length === 0) {
      return '';
    }
    const current = list.find((day) => {
      const startMs = toInstant(day.startIso);
      const endMs = toInstant(day.endIso);
      return startMs !== null && endMs !== null && nowMs >= startMs && nowMs < endMs;
    });
    if (current) {
      return current.id;
    }
    const firstStartMs = toInstant(list[0].startIso);
    return firstStartMs !== null && nowMs < firstStartMs ? list[0].id : list[list.length - 1].id;
  }

  /**
   * Lower-cases text and strips accents so that "Bâtard" matches "batard".
   * @param {string} text
   * @returns {string}
   */
  function fold(text) {
    return text.normalize('NFD').replace(COMBINING_MARKS, '').toLowerCase();
  }

  /**
   * True when every word of the query appears in the text. A blank query matches everything.
   * The query is only ever compared, never rendered.
   * @param {unknown} haystack
   * @param {unknown} query
   * @returns {boolean}
   */
  function matchesQuery(haystack, query) {
    const words = typeof query === 'string' ? query.trim() : '';
    if (words === '') {
      return true;
    }
    if (typeof haystack !== 'string' || words.length > MAX_QUERY_LENGTH) {
      return false;
    }
    const folded = fold(haystack);
    return fold(words).split(/\s+/).every((word) => folded.includes(word));
  }

  /**
   * True when an item carries the chosen category. "all" or no category passes everything.
   * @param {unknown} itemCats
   * @param {unknown} cat
   * @returns {boolean}
   */
  function matchesFilter(itemCats, cat) {
    if (cat === ALL_FILTER || cat === '' || cat === undefined || cat === null) {
      return true;
    }
    return Array.isArray(itemCats) && itemCats.includes(cat);
  }

  /**
   * Reads saved ticks. Anything that is not a list of known ids is dropped.
   * @param {unknown} raw text read from storage
   * @param {string[]} knownIds
   * @returns {string[]}
   */
  function parseTicks(raw, knownIds) {
    if (typeof raw !== 'string') {
      return [];
    }
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return [];
    }
    if (!Array.isArray(parsed)) {
      return [];
    }
    const known = new Set(Array.isArray(knownIds) ? knownIds : []);
    return [...new Set(parsed.filter((id) => typeof id === 'string' && known.has(id)))];
  }

  /**
   * @param {string[]} ids
   * @returns {string} text for storage
   */
  function serialiseTicks(ids) {
    return JSON.stringify(Array.isArray(ids) ? ids : []);
  }

  /**
   * Wraps a browser store so that a blocked or missing store never throws.
   * The caller shows a notice when `write` returns false.
   * @param {() => { getItem(key: string): string | null, setItem(key: string, value: string): void }} getStorage
   * @returns {{ read(key: string): string | null, write(key: string, value: string): boolean }}
   */
  function safeStorage(getStorage) {
    return {
      read(key) {
        try {
          const value = getStorage().getItem(key);
          return typeof value === 'string' ? value : null;
        } catch {
          return null;
        }
      },
      write(key, value) {
        try {
          getStorage().setItem(key, value);
          return true;
        } catch {
          return false;
        }
      },
    };
  }

  /**
   * Maps a location hash to a known view id.
   * @param {unknown} hash for example "#plan"
   * @param {string[]} viewIds
   * @param {string} fallbackId
   * @returns {string}
   */
  function viewForHash(hash, viewIds, fallbackId) {
    const name = typeof hash === 'string' ? hash.replace(/^#/, '') : '';
    return Array.isArray(viewIds) && viewIds.includes(name) ? name : fallbackId;
  }

  /**
   * Works out which tab a key press moves to. Arrows wrap; Home and End jump to the ends.
   * @param {string} key a KeyboardEvent key
   * @param {number} index the focused tab
   * @param {number} count how many tabs there are
   * @returns {number | null} the tab to select, or null when the key does not move focus
   */
  function tabIndexForKey(key, index, count) {
    if (!Number.isInteger(count) || count <= 0) {
      return null;
    }
    switch (key) {
      case 'ArrowRight':
        return (index + 1) % count;
      case 'ArrowLeft':
        return (index - 1 + count) % count;
      case 'Home':
        return 0;
      case 'End':
        return count - 1;
      default:
        return null;
    }
  }

  return {
    nextUp,
    countdownParts,
    countdownText,
    countdownCaption,
    activeDayId,
    tabIndexForKey,
    matchesQuery,
    matchesFilter,
    parseTicks,
    serialiseTicks,
    safeStorage,
    viewForHash,
  };
});
