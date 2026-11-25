'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');

const NUMBER_WORDS = ['No', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten'];
const page = readFileSync(join(__dirname, '..', 'index.html'), 'utf8');
const textOf = (html) => html.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();

/**
 * @typedef {{ name: string, note: string }} Place
 * @returns {Place[]} every place on the page, with the text of its Note
 */
function readPlaces() {
  return [...page.matchAll(/<li class="row place"[^>]*>.*<\/li>/g)].map(([row]) => ({
    name: textOf(/<span class="place__name">(.*?)<\/span><span class="place__fact">/.exec(row)[1]),
    note: textOf((/<dt>Note<\/dt><dd>(.*?)<\/dd>/.exec(row) ?? ['', ''])[1]),
  }));
}

/** True when `full` is `short` or begins with it as whole words: "Po Kee" matches "Po Kee", never "Po Keeper". */
const startsWithName = (full, short) => full === short || full.startsWith(`${short} `);

/** The places whose own note says they take no cards. */
const placesWithoutCards = readPlaces().filter((place) => /\b(?:Cash only|No cards)\b/.test(place.note));

test('the page lists its places, and some of them take no cards', () => {
  // Each card sits on one line of the page. If that ever changes, this fails loudly instead of reading no places.
  assert.equal(readPlaces().length, (page.match(/<li class="row place"/g) ?? []).length);
  assert.ok(readPlaces().length >= 40, `only ${readPlaces().length} places were read`);
  assert.ok(placesWithoutCards.length >= 1, 'no place says it takes no cards');
});

test('the to-do note counts the places that take no cards', () => {
  const note = /<p class="todo__note">(\w+) of the places here take no cards\.<\/p>/.exec(page);

  assert.notEqual(note, null, 'the to-do note about cash is missing or worded another way');
  assert.equal(note[1], NUMBER_WORDS[placesWithoutCards.length], `${placesWithoutCards.length} places say they take no cards: ${placesWithoutCards.map((place) => place.name).join(', ')}`);
});

test('the paying answer names exactly the places that take no cards', () => {
  const sentence = /<p>Carry cash\. (.*?) take no cards/.exec(page);

  assert.notEqual(sentence, null, 'the paying answer no longer lists the places that take no cards');
  const named = sentence[1].split(/, | and /).map((name) => name.trim());
  // The answer uses each place's short name: the first words of the name on its card.
  const unnamed = placesWithoutCards.filter((place) => !named.some((name) => startsWithName(place.name, name)));
  const unknown = named.filter((name) => !placesWithoutCards.some((place) => startsWithName(place.name, name)));

  assert.deepEqual(unnamed.map((place) => place.name), [], 'a place that takes no cards is missing from the paying answer');
  assert.deepEqual(unknown, [], 'the paying answer names a place that does not say it takes no cards');
});

test('every stop in the day plan that names a place on a card uses a name from the list', () => {
  const stops = [...page.matchAll(/<p class="sched__what">(.*?)<\/p>/g)].map(([, what]) => textOf(what));
  const names = readPlaces().map((place) => place.name);
  // Stops written as "<something> at <place>". Airports, the hotel and the concert hall are not cards.
  const NOT_CARDS = /^(?:Terminal 1|Oasis Aurum 181|the hotel)$/;
  const namedPlaces = stops.map((stop) => / at (.+)$/.exec(stop)).filter(Boolean).map(([, place]) => place).filter((place) => !NOT_CARDS.test(place));

  assert.ok(namedPlaces.length >= 8, `only ${namedPlaces.length} stops name a place`);
  assert.deepEqual(namedPlaces.filter((place) => !names.some((name) => startsWithName(name, place))), [], 'a stop names a place that has no card');
});
