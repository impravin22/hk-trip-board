'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const logic = require('../trip-logic.js');

const EVENTS = [
  { id: 'fly-out', label: 'CX469 to Hong Kong', startIso: '2026-12-02T22:25:00+08:00' },
  { id: 'land', label: 'Land in Hong Kong', startIso: '2026-12-03T00:20:00+08:00' },
  { id: 'concert', label: 'FKJ at AsiaWorld-Expo', startIso: '2026-12-03T20:00:00+08:00' },
  { id: 'check-out', label: 'Check out of the hotel', startIso: '2026-12-06T12:00:00+08:00' },
  { id: 'fly-home', label: 'CX420 to Taipei', startIso: '2026-12-06T14:05:00+08:00' },
];

const DAYS = [
  { id: 'wed', startIso: '2026-12-02T00:00:00+08:00', endIso: '2026-12-03T00:00:00+08:00' },
  { id: 'thu', startIso: '2026-12-03T00:00:00+08:00', endIso: '2026-12-04T00:00:00+08:00' },
  { id: 'fri', startIso: '2026-12-04T00:00:00+08:00', endIso: '2026-12-05T00:00:00+08:00' },
  { id: 'sat', startIso: '2026-12-05T00:00:00+08:00', endIso: '2026-12-06T00:00:00+08:00' },
  { id: 'sun', startIso: '2026-12-06T00:00:00+08:00', endIso: '2026-12-07T00:00:00+08:00' },
];

const VIEWS = ['board', 'plan', 'places', 'info'];
const ONE_HOUR_MS = 3600000;
const at = (iso) => Date.parse(iso);

test('nextUp returns the outbound flight nine days before the trip', () => {
  const result = logic.nextUp(at('2026-11-23T10:00:00+08:00'), EVENTS);

  assert.equal(result.state, 'before');
  assert.equal(result.event.id, 'fly-out');
  assert.deepEqual(logic.countdownParts(result.msUntil), { days: 9, hours: 12, minutes: 25 });
});

test('nextUp returns the concert one hour before it starts', () => {
  const result = logic.nextUp(at('2026-12-03T19:00:00+08:00'), EVENTS);

  assert.equal(result.state, 'during');
  assert.equal(result.event.id, 'concert');
  assert.equal(result.msUntil, ONE_HOUR_MS);
});

test('nextUp reports the trip as over after the flight home has left', () => {
  const result = logic.nextUp(at('2026-12-06T16:00:00+08:00'), EVENTS);

  assert.equal(result.state, 'after');
  assert.equal(result.event, null);
  assert.equal(result.msUntil, 0);
});

test('nextUp gives the same answer for the same instant written in another time zone', () => {
  const inHongKong = logic.nextUp(at('2026-11-23T10:00:00+08:00'), EVENTS);
  const inLosAngeles = logic.nextUp(at('2026-11-22T18:00:00-08:00'), EVENTS);

  assert.deepEqual(inLosAngeles, inHongKong);
});

test('nextUp skips an event whose time cannot be read', () => {
  const events = [{ id: 'broken', label: 'Broken', startIso: 'not a date' }, EVENTS[2]];

  const result = logic.nextUp(at('2026-12-03T19:00:00+08:00'), events);

  assert.equal(result.event.id, 'concert');
});

test('nextUp reports the trip as over when there are no events', () => {
  const result = logic.nextUp(at('2026-11-23T10:00:00+08:00'), []);

  assert.deepEqual(result, { state: 'after', event: null, msUntil: 0 });
});

test('countdownParts floors to whole minutes and never goes negative', () => {
  assert.deepEqual(logic.countdownParts(59999), { days: 0, hours: 0, minutes: 0 });
  assert.deepEqual(logic.countdownParts(60000), { days: 0, hours: 0, minutes: 1 });
  assert.deepEqual(logic.countdownParts(-5000), { days: 0, hours: 0, minutes: 0 });
  assert.deepEqual(logic.countdownParts(Number.NaN), { days: 0, hours: 0, minutes: 0 });
});

test('countdownText gives whole days when two days or more remain', () => {
  assert.equal(logic.countdownText({ days: 9, hours: 12, minutes: 25 }), '9 days');
  assert.equal(logic.countdownText({ days: 2, hours: 0, minutes: 0 }), '2 days');
});

test('countdownText gives whole hours from six hours up to two days', () => {
  assert.equal(logic.countdownText({ days: 1, hours: 23, minutes: 59 }), '47 hours');
  assert.equal(logic.countdownText({ days: 1, hours: 7, minutes: 0 }), '31 hours');
  assert.equal(logic.countdownText({ days: 0, hours: 6, minutes: 10 }), '6 hours');
});

test('countdownText gives hours and minutes inside the last six hours, and never a zero unit', () => {
  assert.equal(logic.countdownText({ days: 0, hours: 5, minutes: 59 }), '5 hours 59 minutes');
  assert.equal(logic.countdownText({ days: 0, hours: 1, minutes: 0 }), '1 hour');
  assert.equal(logic.countdownText({ days: 0, hours: 1, minutes: 1 }), '1 hour 1 minute');
});

test('countdownText gives minutes inside the last hour, then Now', () => {
  assert.equal(logic.countdownText({ days: 0, hours: 0, minutes: 45 }), '45 minutes');
  assert.equal(logic.countdownText({ days: 0, hours: 0, minutes: 1 }), '1 minute');
  assert.equal(logic.countdownText({ days: 0, hours: 0, minutes: 0 }), 'Now');
});

test('countdownCaption reads "Until" and the event while time remains', () => {
  assert.equal(logic.countdownCaption('FKJ starts', '1 hour'), 'Until FKJ starts.');
  assert.equal(logic.countdownCaption('CX469 leaves Taipei', '9 days'), 'Until CX469 leaves Taipei.');
});

test('countdownCaption names the event alone, with a capital, when the figure reads Now', () => {
  assert.equal(logic.countdownCaption('you land in Hong Kong', 'Now'), 'You land in Hong Kong.');
  assert.equal(logic.countdownCaption('FKJ starts', 'Now'), 'FKJ starts.');
});

test('countdownCaption is empty when there is no event to name', () => {
  assert.equal(logic.countdownCaption('', '9 days'), '');
  assert.equal(logic.countdownCaption('   ', 'Now'), '');
  assert.equal(logic.countdownCaption(undefined, 'Now'), '');
});

test('activeDayId opens the first day before the trip', () => {
  assert.equal(logic.activeDayId(at('2026-11-23T10:00:00+08:00'), DAYS), 'wed');
});

test('activeDayId opens the day that contains the current instant', () => {
  assert.equal(logic.activeDayId(at('2026-12-04T09:00:00+08:00'), DAYS), 'fri');
  assert.equal(logic.activeDayId(at('2026-12-03T00:00:00+08:00'), DAYS), 'thu');
});

test('activeDayId opens the last day after the trip', () => {
  assert.equal(logic.activeDayId(at('2026-12-09T09:00:00+08:00'), DAYS), 'sun');
});

test('activeDayId returns an empty id when there are no days', () => {
  assert.equal(logic.activeDayId(at('2026-12-04T09:00:00+08:00'), []), '');
});

test('matchesQuery finds every word of the query in any order, ignoring case', () => {
  assert.equal(logic.matchesQuery('Roast goose, Sheung Wan', 'GOOSE sheung'), true);
  assert.equal(logic.matchesQuery('Roast goose, Sheung Wan', 'goose kowloon'), false);
});

test('matchesQuery treats an empty or blank query as matching everything', () => {
  assert.equal(logic.matchesQuery('Roast goose, Sheung Wan', ''), true);
  assert.equal(logic.matchesQuery('Roast goose, Sheung Wan', '   '), true);
});

test('matchesQuery ignores accents', () => {
  assert.equal(logic.matchesQuery('Club Bâtard, Pedder Building', 'batard'), true);
});

test('matchesQuery returns false for markup and over-long queries without throwing', () => {
  assert.equal(logic.matchesQuery('Roast goose, Sheung Wan', '<img onerror=1>'), false);
  assert.equal(logic.matchesQuery('Roast goose, Sheung Wan', 'a'.repeat(10000)), false);
});

test('matchesQuery rejects a haystack that is not text and treats a query that is not text as blank', () => {
  assert.equal(logic.matchesQuery(undefined, 'goose'), false);
  assert.equal(logic.matchesQuery('Roast goose', null), true);
});

test('matchesFilter passes everything for the all filter and only tagged items otherwise', () => {
  assert.equal(logic.matchesFilter(['wine', 'splurge'], 'wine'), true);
  assert.equal(logic.matchesFilter(['wine', 'splurge'], 'all'), true);
  assert.equal(logic.matchesFilter(['wine'], 'guinness'), false);
  assert.equal(logic.matchesFilter(['wine'], ''), true);
  assert.equal(logic.matchesFilter(undefined, 'wine'), false);
});

test('parseTicks keeps only known ids', () => {
  assert.deepEqual(logic.parseTicks('["print-par","bogus"]', ['print-par', 'msg-hotel']), ['print-par']);
});

test('parseTicks returns an empty list for text that is not a list of ids', () => {
  const known = ['print-par', 'msg-hotel'];

  assert.deepEqual(logic.parseTicks('not json', known), []);
  assert.deepEqual(logic.parseTicks(null, known), []);
  assert.deepEqual(logic.parseTicks('{"a":1}', known), []);
});

test('parseTicks drops entries that are not text and removes repeats', () => {
  const raw = '[1,null,"print-par","print-par",{"id":"msg-hotel"}]';

  assert.deepEqual(logic.parseTicks(raw, ['print-par', 'msg-hotel']), ['print-par']);
});

test('serialiseTicks output is read back unchanged by parseTicks', () => {
  const ids = ['print-par', 'msg-hotel'];

  assert.deepEqual(logic.parseTicks(logic.serialiseTicks(ids), ids), ids);
});

test('safeStorage reads and writes through a working store', () => {
  const data = new Map();
  const store = { getItem: (key) => (data.has(key) ? data.get(key) : null), setItem: (key, value) => data.set(key, value) };
  const storage = logic.safeStorage(() => store);

  assert.equal(storage.write('ticks', '["a"]'), true);
  assert.equal(storage.read('ticks'), '["a"]');
});

test('safeStorage returns null and false when the store throws', () => {
  const broken = {
    getItem: () => { throw new Error('blocked'); },
    setItem: () => { throw new Error('blocked'); },
  };
  const storage = logic.safeStorage(() => broken);

  assert.equal(storage.read('ticks'), null);
  assert.equal(storage.write('ticks', '[]'), false);
});

test('safeStorage returns null and false when reaching the store throws', () => {
  const storage = logic.safeStorage(() => { throw new Error('SecurityError'); });

  assert.equal(storage.read('ticks'), null);
  assert.equal(storage.write('ticks', '[]'), false);
});

test('tabIndexForKey moves right and wraps to the first tab', () => {
  assert.equal(logic.tabIndexForKey('ArrowRight', 0, 5), 1);
  assert.equal(logic.tabIndexForKey('ArrowRight', 4, 5), 0);
});

test('tabIndexForKey moves left and wraps to the last tab', () => {
  assert.equal(logic.tabIndexForKey('ArrowLeft', 0, 5), 4);
  assert.equal(logic.tabIndexForKey('ArrowLeft', 3, 5), 2);
});

test('tabIndexForKey jumps to the ends on Home and End', () => {
  assert.equal(logic.tabIndexForKey('Home', 3, 5), 0);
  assert.equal(logic.tabIndexForKey('End', 1, 5), 4);
});

test('tabIndexForKey returns null for any other key and for an empty tab list', () => {
  assert.equal(logic.tabIndexForKey('Enter', 2, 5), null);
  assert.equal(logic.tabIndexForKey('toString', 2, 5), null);
  assert.equal(logic.tabIndexForKey('ArrowRight', 0, 0), null);
});

test('viewForHash opens the view named in the hash', () => {
  assert.equal(logic.viewForHash('#plan', VIEWS, 'board'), 'plan');
});

test('viewForHash falls back to the start view for an empty or unknown hash', () => {
  assert.equal(logic.viewForHash('', VIEWS, 'board'), 'board');
  assert.equal(logic.viewForHash('#settings', VIEWS, 'board'), 'board');
  assert.equal(logic.viewForHash('#<script>alert(1)</script>', VIEWS, 'board'), 'board');
  assert.equal(logic.viewForHash(undefined, VIEWS, 'board'), 'board');
});
