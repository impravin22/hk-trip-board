/**
 * Page wiring for the Hong Kong trip board: views, the live board, the day switcher,
 * place search and saved ticks. Every decision that can be tested lives in trip-logic.js;
 * this file only reads and writes the page. The page reads in full without this script.
 */
(function () {
  'use strict';

  const logic = window.TripLogic;
  if (!logic) {
    return;
  }

  const VIEW_IDS = ['board', 'plan', 'places', 'info'];
  const START_VIEW = 'board';
  const BASE_TITLE = 'Hong Kong Trip Board';
  const VIEW_TITLES = { plan: 'Plan', places: 'Places', info: 'Info' };
  const TICKS_KEY = 'hk-trip-ticks-v1';
  const BOARD_REFRESH_MS = 30000;
  const DEFAULT_FILTER = 'top';
  const ALL_FILTER = 'all';
  const STORAGE_NOTICE = 'Ticks cannot be saved on this device. The list still works until you close this page.';

  const root = document.documentElement;
  const one = (selector, scope = document) => scope.querySelector(selector);
  const all = (selector, scope = document) => [...scope.querySelectorAll(selector)];

  /** Reading `window.localStorage` can itself throw, so the store is reached through a getter. */
  const storage = logic.safeStorage(() => window.localStorage);

  /** Shows one view, marks its nav link and, after a user's navigation, moves focus to its title. */
  function showView(viewId, shouldFocusTitle) {
    document.title = viewId === START_VIEW ? BASE_TITLE : `${VIEW_TITLES[viewId]}, ${BASE_TITLE}`;
    all('[data-view]').forEach((view) => view.classList.toggle('is-active', view.dataset.view === viewId));
    all('[data-view-link]').forEach((link) => {
      if (link.dataset.viewLink === viewId) {
        link.setAttribute('aria-current', 'page');
      } else {
        link.removeAttribute('aria-current');
      }
    });
    if (shouldFocusTitle) {
      const title = all('[data-view-title]').find((heading) => heading.closest('[data-view]').dataset.view === viewId);
      window.scrollTo(0, 0);
      if (title) {
        title.focus({ preventScroll: true });
      }
    }
  }

  /** Reads the hash: a view name opens that view; any other id opens the view that holds it. */
  function route(isUserNavigation) {
    const hash = window.location.hash;
    const namedView = logic.viewForHash(hash, VIEW_IDS, '');
    const target = namedView === '' && hash.length > 1 ? document.getElementById(hash.slice(1)) : null;
    const holdingView = target ? target.closest('[data-view]') : null;
    const shouldFocusTitle = isUserNavigation && namedView !== '';
    const isEmptyHash = hash === '' || hash === '#';
    const activeView = one('[data-view].is-active');
    const fallbackView = activeView && !isEmptyHash ? activeView.dataset.view : START_VIEW;
    showView(namedView || (holdingView ? holdingView.dataset.view : fallbackView), shouldFocusTitle);
    if (target && holdingView) {
      if (target.dataset.day) {
        selectDay(target.dataset.day, false);
      }
      target.scrollIntoView();
      if (isUserNavigation) {
        target.tabIndex = -1;
        target.focus({ preventScroll: true });
      }
    }
  }

  function readEvents() {
    return all('[data-event]').map((row) => ({ id: row.dataset.event, label: row.dataset.label, startIso: row.dataset.start }));
  }

  /** Writes the countdown and marks the next row on the board. */
  function renderBoard() {
    const figure = one('[data-countdown]');
    const caption = one('[data-countdown-caption]');
    if (!figure || !caption) {
      return;
    }
    const next = logic.nextUp(Date.now(), readEvents());
    all('[data-event]').forEach((row) => {
      const isNext = next.event !== null && row.dataset.event === next.event.id;
      const state = one('[data-state]', row);
      if (isNext) {
        row.setAttribute('aria-current', 'true');
      } else {
        row.removeAttribute('aria-current');
      }
      if (state) {
        state.textContent = isNext ? 'Next' : '';
        state.classList.toggle('live', isNext);
      }
    });
    if (next.event === null) {
      figure.textContent = 'Trip complete';
      caption.textContent = 'CX420 has left Hong Kong.';
      return;
    }
    const text = logic.countdownText(logic.countdownParts(next.msUntil));
    figure.textContent = text;
    caption.textContent = logic.countdownCaption(next.event.label, text);
  }

  function readDays() {
    return all('[data-day]').map((panel) => ({ id: panel.dataset.day, startIso: panel.dataset.start, endIso: panel.dataset.end }));
  }

  function selectDay(dayId, shouldFocusTab) {
    all('[data-day-tab]').forEach((tab) => {
      const isSelected = tab.dataset.dayTab === dayId;
      tab.setAttribute('aria-selected', String(isSelected));
      tab.tabIndex = isSelected ? 0 : -1;
      if (isSelected && shouldFocusTab) {
        tab.focus();
      }
    });
    all('[data-day]').forEach((panel) => {
      panel.hidden = panel.dataset.day !== dayId;
    });
  }

  /** Turns the stacked days into tabs: arrows, Home and End move and select. */
  function initDays() {
    const tabs = all('[data-day-tab]');
    if (tabs.length === 0) {
      return;
    }
    all('[data-day]').forEach((panel) => {
      panel.setAttribute('role', 'tabpanel');
      panel.setAttribute('aria-labelledby', `tab-${panel.dataset.day}`);
    });
    tabs.forEach((tab, index) => {
      tab.addEventListener('click', () => selectDay(tab.dataset.dayTab, false));
      tab.addEventListener('keydown', (event) => {
        const hasModifier = event.altKey || event.ctrlKey || event.metaKey;
        const targetIndex = hasModifier ? null : logic.tabIndexForKey(event.key, index, tabs.length);
        if (targetIndex === null) {
          return;
        }
        event.preventDefault();
        selectDay(tabs[targetIndex].dataset.dayTab, true);
      });
    });
    selectDay(logic.activeDayId(Date.now(), readDays()), false);
  }

  /** The words a search looks through: the name, the one-line fact and the details, never the control labels. */
  function placeText(place) {
    return all('.place__name, .place__fact, dd', place).map((part) => part.textContent).join(' ');
  }

  function setFilter(value) {
    const radio = all('[data-filter]').find((input) => input.value === value);
    if (radio) {
      radio.checked = true;
    }
  }

  /** Shows the places that pass the chosen filter and the search text, and says how many. */
  function applyFilters() {
    const input = one('[data-place-search]');
    const count = one('[data-place-count]');
    const empty = one('[data-empty]');
    if (!input || !count || !empty) {
      return;
    }
    const checked = one('[data-filter]:checked');
    const filter = checked ? checked.value : ALL_FILTER;
    const shownCount = all('[data-place]').filter((place) => {
      const isShown = logic.matchesFilter(place.dataset.cats.split(' '), filter) && logic.matchesQuery(placeText(place), input.value);
      place.hidden = !isShown;
      return isShown;
    }).length;
    count.textContent = shownCount === 1 ? '1 place' : `${shownCount} places`;
    empty.hidden = shownCount > 0;
    one('[data-empty-query]', empty).textContent = input.value.trim();
  }

  /** A search looks through every place, so typing leaves the "Top picks" filter. */
  function searchFor(query) {
    const input = one('[data-place-search]');
    if (!input) {
      return;
    }
    input.value = query;
    const checked = one('[data-filter]:checked');
    if (query.trim() !== '' && checked && checked.value === DEFAULT_FILTER) {
      setFilter(ALL_FILTER);
    }
    applyFilters();
  }

  function clearSearch() {
    setFilter(DEFAULT_FILTER);
    searchFor('');
  }

  function initPlaces() {
    const input = one('[data-place-search]');
    if (!input) {
      return;
    }
    input.addEventListener('input', () => searchFor(input.value));
    input.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && input.value !== '') {
        event.preventDefault();
        clearSearch();
      }
    });
    all('[data-filter]').forEach((radio) => radio.addEventListener('change', applyFilters));
    all('[data-clear-search]').forEach((button) => button.addEventListener('click', () => {
      clearSearch();
      input.focus();
    }));
    // A category card on Overview opens Places on its filter: the filter is set before the hash changes the view.
    all('[data-filter-link]').forEach((link) => link.addEventListener('click', () => {
      setFilter(link.dataset.filterLink);
      searchFor('');
    }));
    applyFilters();
  }

  /** Restores saved ticks, then saves on every change and says so when saving fails. */
  function initTicks() {
    const boxes = all('[data-tick]');
    if (boxes.length === 0) {
      return;
    }
    const count = one('[data-done-count]');
    const notice = one('[data-storage-notice]');
    const saved = logic.parseTicks(storage.read(TICKS_KEY), boxes.map((box) => box.dataset.tick));
    boxes.forEach((box) => {
      box.checked = saved.includes(box.dataset.tick);
    });
    const update = (shouldSave) => {
      const ticked = boxes.filter((box) => box.checked).map((box) => box.dataset.tick);
      if (count) {
        count.textContent = `${ticked.length} of ${boxes.length} done`;
      }
      if (shouldSave && notice) {
        notice.textContent = storage.write(TICKS_KEY, logic.serialiseTicks(ticked)) ? '' : STORAGE_NOTICE;
      }
    };
    boxes.forEach((box) => box.addEventListener('change', () => update(true)));
    update(false);
  }

  root.classList.add('js');
  root.lang = 'en-GB';
  initDays();
  initPlaces();
  initTicks();
  renderBoard();
  let boardTimer = window.setInterval(renderBoard, BOARD_REFRESH_MS);
  window.addEventListener('pagehide', () => window.clearInterval(boardTimer));
  window.addEventListener('pageshow', (event) => {
    if (event.persisted) {
      renderBoard();
      boardTimer = window.setInterval(renderBoard, BOARD_REFRESH_MS);
    }
  });
  window.addEventListener('hashchange', () => route(true));
  route(false);
})();
