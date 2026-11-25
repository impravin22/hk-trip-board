// End-to-end checks of the built page in a real Chrome, driven through puppeteer-core.
// Nothing is installed: point PUPPETEER_CORE at a puppeteer-core folder already on the machine.
// Usage: PUPPETEER_CORE=/path/to/node_modules/puppeteer-core node tests/e2e.mjs
// Security note: `page.evaluate`, `page.evaluateOnNewDocument`, `page.$eval` and `page.$$eval` are puppeteer
// methods that run the fixed function literals written in this file inside the test page. No string is ever
// evaluated as code.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, readdirSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const CHROME_PATH = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const DESKTOP = { width: 1440, height: 900 };
const LAPTOP = { width: 1280, height: 800 };
const SMALL_LAPTOP = { width: 1024, height: 768 };
const TABLET = { width: 768, height: 1024 };
/** What a 1280px window shows at 200% browser zoom. */
const HALF_DESKTOP = { width: 640, height: 400 };
const PHONE = { width: 375, height: 812 };
const SMALL_PHONE = { width: 360, height: 740 };
const NARROW_PHONE = { width: 320, height: 640 };
const VIEW_IDS = ['board', 'plan', 'places', 'info'];
const MAX_TEXT_PX = 32;
const MAX_DISPLAY_PX = 72;
const MAX_ADDRESS_PX = 48;
const MIN_TOUCH_PX = 44;
const MIN_HERO_PX = 360;
const ALLOWED_WEIGHTS = [400, 600, 700];
const WHITE = 'rgb(255, 255, 255)';
const PRIMARY_TEXT = 'rgb(42, 42, 42)';
const SIDE_COLUMN_OFFSET_PX = 300;
const PLACE_COUNT = 52;
const TOP_PICK_COUNT = 12;
/** At 1440px the hero photograph may sit this far in from each side of the window, and no further. */
const HERO_INSET_MAX_PX = 48;
/** WCAG 2.1 AA floors for text: 3:1 for large text (24px, or 18.67px bold), 4.5:1 for the rest. */
const LARGE_TEXT_CONTRAST = 3;
const TEXT_CONTRAST = 4.5;
/** White text set on a photograph, by view. Contrast is measured against the bright end of what lies behind it:
 * the 95th percentile, so a few lit windows do not decide it but a pale sky or a white plate does. */
const BRIGHT_PERCENTILE = 0.95;
/** The brightest hundredth behind small text is held to the large-text floor, so a bright patch cannot hide in the tail. */
const BRIGHT_TAIL_PERCENTILE = 0.99;
const TEXT_ON_PHOTOS = [
  { view: 'board', selector: '.hero h1', minimum: LARGE_TEXT_CONTRAST },
  { view: 'board', selector: '.hero__lead', minimum: TEXT_CONTRAST },
  { view: 'board', selector: '.pick__name', minimum: TEXT_CONTRAST },
  { view: 'board', selector: '.pick__count', minimum: TEXT_CONTRAST },
  { view: 'plan', selector: '.day__title', minimum: LARGE_TEXT_CONTRAST },
];
const MAPS_LINK = 'https://www.google.com/maps/search/?api=1&query=';
/** Places with no single point on a map: the tram network. */
const PLACES_WITHOUT_A_MAP = ['Trams'];
/** Checks run with motion switched off, so no reading or picture catches a transition half way. */
const REDUCED_MOTION = { name: 'prefers-reduced-motion', value: 'reduce' };
/** A title and its description inside one container, and how many such pairs the page must hold at least. */
const TITLE_PAIRS = [
  ['.hero', 'h1', '.hero__lead', 1],
  ['.view-head', 'h1', '.lead', 2],
  ['.head', 'h2', '.lead', 1],
  ['.tile', '.tile__value', '.tile__sub', 4],
  ['.card__head', '.card__title', '.card__desc', 4],
  ['.pick', '.pick__name', '.pick__count', 6],
  ['.address', '.address__local', '.address__label', 1],
  ['.todo', '.todo__label', '.todo__note', 7],
  ['.sched__row', '.sched__what', '.sched__note', 26],
  ['.place', '.place__name', '.place__fact', 47],
  ['.qa', 'summary', '.qa__a p', 9],
  ['.empty', '.empty__title', '.empty__text', 1],
];
/** The controls a thumb has to hit, by the view they sit on. */
const TOUCH_CONTROLS = {
  board: ['.nav__link', '.hero .btn', '.pick', '.todo__label', '.address .btn', '.credits summary', '.credits a'],
  plan: ['[role="tab"]'],
  places: ['#place-search', '.chip', '.place__summary', '.place__map', '.more__links a', '[data-clear-search]'],
  info: ['.qa summary'],
};
const STORAGE_NOTICE = 'Ticks cannot be saved on this device. The list still works until you close this page.';
const MARKUP_QUERY = '<img src=x onerror=alert(1)>';
const NINE_DAYS_BEFORE_FLIGHT = '2026-11-23T10:00:00+08:00';
const HOUR_BEFORE_CONCERT = '2026-12-03T19:00:00+08:00';
const HALF_MINUTE_BEFORE_CONCERT = '2026-12-03T19:59:30+08:00';
const AFTER_FLIGHT_HOME = '2026-12-06T16:00:00+08:00';

if (!process.env.PUPPETEER_CORE) {
  console.error('Set PUPPETEER_CORE to a puppeteer-core install.');
  process.exit(2);
}
const loaded = createRequire(import.meta.url)(process.env.PUPPETEER_CORE);
const puppeteer = loaded.default ?? loaded;
const siteDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const shotsDir = join(siteDir, '.maestro', 'shots');
/** E2E_LIGHT_PAGE points the checks at another build of the page, such as the one made for a plain web host. */
const lightPage = process.env.E2E_LIGHT_PAGE ? pathToFileURL(resolve(process.env.E2E_LIGHT_PAGE)).href : null;
const urlOf = (fileName, hash = '') => `${fileName === 'preview-light.html' && lightPage ? lightPage : pathToFileURL(join(siteDir, fileName)).href}${hash}`;
/** E2E_ONLY runs just the checks whose name matches this pattern: for a quick look at one check, never as the full run. */
const ONLY = process.env.E2E_ONLY ? new RegExp(process.env.E2E_ONLY) : null;

// Rebuild the previews first, so these checks never run against a stale page. Fixed arguments, no shell.
execFileSync(process.execPath, [join(siteDir, 'tools', 'build-preview.mjs')]);

const results = [];
const pageErrors = [];
/** Runs one named check and records whether it passed. */
async function check(name, run) {
  if (ONLY && !ONLY.test(name)) {
    return;
  }
  try {
    const note = await run();
    results.push({ name, ok: true, note });
  } catch (error) {
    results.push({ name, ok: false, note: error.message.split('\n').map((line) => line.trim()).filter(Boolean).slice(0, 4).join(' ') });
  }
}

const isShown = (page, selector) => page.$eval(selector, (element) => element.getClientRects().length > 0);
const textOf = (page, selector) => page.$eval(selector, (element) => element.textContent.trim());
const shownPlaces = (page) => page.$$eval('[data-place]', (places) => places.filter((place) => !place.hidden).length);
/** The event of every row marked as next: there is never more than one. */
const nextRows = (page) => page.$$eval('[data-event][aria-current]', (rows) => rows.map((row) => row.dataset.event));
/** The day of every selected day tab: there is always exactly one. */
const selectedDays = (page) => page.$$eval('[role="tab"][aria-selected="true"]', (tabs) => tabs.map((tab) => tab.dataset.dayTab));
/** A hash change is handled a moment after the click that causes it: waits until the open view is the one the address names. */
const viewSettled = (page) => page.waitForFunction((viewIds) => {
  const name = location.hash.slice(1);
  const open = document.querySelector('[data-view].is-active');
  return open !== null && (!viewIds.includes(name) || open.dataset.view === name);
}, { polling: 50, timeout: 3000 }, VIEW_IDS);
/** How many place photographs are on show. */
const shownPlacePhotos = (page) => page.$$eval('.place__photo', (images) => images.filter((image) => image.getClientRects().length > 0).length);

/** Opens every disclosure and every day on the open view, so that a scan sees all of its text. */
const openEverything = (page) => page.evaluate(() => {
  document.querySelectorAll('details').forEach((details) => {
    details.open = true;
  });
  document.querySelectorAll('[data-day]').forEach((day) => {
    day.hidden = false;
  });
});

/** The type settings of every visible piece of text on the open view, one entry for each distinct setting. */
const typeInUse = (page) => page.evaluate(() => {
  const seen = new Map();
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const parent = node.parentElement;
    const text = node.textContent.trim();
    if (!parent || text === '' || !parent.checkVisibility() || parent.closest('script, style, .visually-hidden')) continue;
    const style = getComputedStyle(parent);
    const entry = {
      size: parseFloat(style.fontSize),
      weight: Number(style.fontWeight),
      slant: style.fontStyle,
      spacing: style.letterSpacing,
      isDisplay: parent.closest('[data-display]') !== null,
      isAddress: parent.closest('[data-address]') !== null,
      sample: text.slice(0, 32),
    };
    const key = [entry.size, entry.weight, entry.slant, entry.spacing, entry.isDisplay, entry.isAddress].join('|');
    if (!seen.has(key)) seen.set(key, entry);
  }
  return [...seen.values()];
});

/** For each title pair: how many were found, and those whose description is not set smaller than its title. */
const titlePairs = (page) => page.evaluate((pairs) => pairs.map(([containerSelector, titleSelector, descriptionSelector, minimum]) => {
  const sizeOf = (element) => parseFloat(getComputedStyle(element).fontSize);
  const offenders = new Set();
  let found = 0;
  for (const container of document.querySelectorAll(containerSelector)) {
    const title = container.querySelector(titleSelector);
    const description = container.querySelector(descriptionSelector);
    if (!title || !description) continue;
    found += 1;
    if (sizeOf(description) >= sizeOf(title)) {
      offenders.add(`${sizeOf(title)}px title, ${sizeOf(description)}px description`);
    }
  }
  return { selector: containerSelector, found, minimum, offenders: [...offenders] };
}), TITLE_PAIRS);

/** Measures the visible controls that match the selectors and lists those smaller than a thumb needs. */
const smallControls = (page, selectors) => page.evaluate((list, floor) => {
  const offenders = new Set();
  let measured = 0;
  for (const selector of list) {
    for (const element of document.querySelectorAll(selector)) {
      if (!element.checkVisibility()) continue;
      measured += 1;
      const box = element.getBoundingClientRect();
      if (Math.round(box.height) < floor || Math.round(box.width) < floor) {
        offenders.add(`${selector} is ${Math.round(box.width)} by ${Math.round(box.height)}px`);
      }
    }
  }
  return { measured, offenders: [...offenders] };
}, selectors, MIN_TOUCH_PX);

/** Elements whose right edge runs past the window. The chip row is left out: it scrolls sideways on purpose. */
const pastTheWindow = (page) => page.evaluate(() => {
  const offenders = new Set();
  for (const element of document.querySelectorAll('.nav *, main *, .footer *')) {
    if (!element.checkVisibility() || element.closest('.chips') || element.closest('.visually-hidden')) continue;
    const box = element.getBoundingClientRect();
    if (box.width > 0 && Math.round(box.right) > window.innerWidth) {
      offenders.add(`${element.tagName.toLowerCase()}.${element.className} ends at ${Math.round(box.right)}px`);
    }
  }
  return [...offenders].slice(0, 5);
});

/** Runs in a blank tab: the WCAG relative luminance at each given percentile of the pixels of a PNG screenshot. */
const luminanceAtPercentiles = async (pngBase64, percentiles) => {
  // A bitmap decoded from the bytes needs no frame to be painted, so this also works in a tab nobody is looking at.
  const bytes = Uint8Array.from(atob(pngBase64), (character) => character.charCodeAt(0));
  const bitmap = await createImageBitmap(new Blob([bytes], { type: 'image/png' }));
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
  const context = canvas.getContext('2d');
  context.drawImage(bitmap, 0, 0);
  const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
  const linear = (value) => (value / 255 <= 0.04045 ? value / 255 / 12.92 : ((value / 255 + 0.055) / 1.055) ** 2.4);
  const values = [];
  for (let index = 0; index < pixels.length; index += 4) {
    values.push(0.2126 * linear(pixels[index]) + 0.7152 * linear(pixels[index + 1]) + 0.0722 * linear(pixels[index + 2]));
  }
  values.sort((first, second) => first - second);
  return percentiles.map((percentile) => values[Math.min(values.length - 1, Math.floor(values.length * percentile))]);
};

/** Loads every photograph on the open page now, whether or not it has scrolled into view. */
const loadEveryPhotograph = async (page) => {
  await page.evaluate(() => {
    document.querySelectorAll('img[loading="lazy"]').forEach((image) => {
      image.loading = 'eager';
    });
  });
  // Polled on a timer, not on animation frames: a tab that is not in front paints no frames.
  await page.waitForFunction(() => [...document.images].every((image) => image.complete), { timeout: 15000, polling: 100 });
};

/** Where sections sit on the page: left edge, top and bottom in page coordinates. */
const sectionBoxes = (page, ids) => page.evaluate((list) => Object.fromEntries(list.map((id) => {
  const box = document.getElementById(id).getBoundingClientRect();
  return [id, { left: Math.round(box.left), top: Math.round(box.top + scrollY), bottom: Math.round(box.bottom + scrollY) }];
})), ids);

/** Runs in a tab before any page script: holds the clock at one instant, as a phone would read it then.
 * Only `Date.now` is held, because that is the one clock trip.js reads. If the page ever reads the time
 * another way, these checks see the real date and fail loudly; hold that clock here too. */
const holdClockAt = (fixedMs) => {
  Date.now = () => fixedMs;
};

/** Runs in a tab before any page script: refuses storage the way a browser with site data blocked does. */
const refuseStorage = () => {
  Object.defineProperty(window, 'localStorage', {
    get() {
      throw new DOMException('Storage is refused for this page.', 'SecurityError');
    },
  });
};

const browser = await puppeteer.launch({ executablePath: CHROME_PATH, headless: true });

/** Opens the page in a new tab. `prepare` runs there before any page script, with `argument` passed to it. */
async function openFresh({ hash = '', prepare = null, argument } = {}) {
  const tab = await browser.newPage();
  tab.on('pageerror', (error) => pageErrors.push(error.message));
  try {
    await tab.setViewport(DESKTOP);
    await tab.emulateMediaFeatures([REDUCED_MOTION]);
    if (prepare) {
      await tab.evaluateOnNewDocument(prepare, argument);
    }
    await tab.goto(urlOf('preview-light.html', hash), { waitUntil: 'load' });
  } catch (error) {
    await tab.close();
    throw error;
  }
  return tab;
}

try {
  mkdirSync(shotsDir, { recursive: true });
  // Clear the last run's screenshots, so a stale picture is never mistaken for this run's.
  for (const fileName of readdirSync(shotsDir).filter((name) => name.endsWith('.png'))) {
    rmSync(join(shotsDir, fileName));
  }
  const page = await browser.newPage();
  page.on('pageerror', (error) => pageErrors.push(error.message));
  // Every check on this tab reads the page nine days before the flight, whatever today's date is.
  await page.evaluateOnNewDocument(holdClockAt, Date.parse(NINE_DAYS_BEFORE_FLIGHT));
  await page.emulateMediaFeatures([REDUCED_MOTION]);
  await page.setViewport(DESKTOP);
  await page.goto(urlOf('preview-light.html'), { waitUntil: 'load' });

  await check('opens on the Overview only', async () => {
    assert.equal(await isShown(page, '#board'), true);
    assert.equal(await isShown(page, '#plan'), false);
    assert.equal(await isShown(page, '#places'), false);
  });
  await check('nine days before the flight the hero counts down to it and the times mark it as next', async () => {
    assert.equal(await textOf(page, '[data-countdown]'), '9 days');
    assert.equal(await textOf(page, '[data-countdown-caption]'), 'Until CX469 leaves Taipei.');
    assert.deepEqual(await nextRows(page), ['fly-out']);
    assert.equal(await textOf(page, '[data-event][aria-current="true"] [data-state]'), 'Next');
  });
  await check('the hero is a loaded photograph with the title and two actions on it, and the trip facts over its lower edge', async () => {
    const hero = await page.$eval('.hero', (section) => {
      const image = section.querySelector('.hero__photo');
      const photo = image.getBoundingClientRect();
      const facts = section.querySelector('.glance').getBoundingClientRect();
      return {
        height: Math.round(photo.height),
        photoWidth: image.complete ? image.naturalWidth : 0,
        alt: image.alt,
        title: section.querySelector('.hero__stage h1').textContent.trim(),
        hasCountdown: section.querySelector('.glance [data-countdown]') !== null,
        facts: section.querySelectorAll('.glance .tile').length,
        actions: [...section.querySelectorAll('.hero__stage .hero__actions a')].map((link) => link.getAttribute('href')),
        overlap: Math.round(photo.bottom - facts.top),
        below: Math.round(facts.bottom - photo.bottom),
      };
    });
    assert.ok(hero.height >= MIN_HERO_PX, `the hero photograph is ${hero.height}px tall`);
    assert.ok(hero.photoWidth >= 1600, `the hero photograph is ${hero.photoWidth}px wide`);
    assert.notEqual(hero.alt.trim(), '');
    assert.equal(hero.title, 'Hong Kong');
    assert.equal(hero.hasCountdown, true);
    assert.equal(hero.facts, 4);
    assert.deepEqual(hero.actions, ['#plan', '#places']);
    assert.ok(hero.overlap > 0 && hero.below > 0, `the facts bar overlaps the photograph by ${hero.overlap}px and ends ${hero.below}px below it`);
    return `${hero.height}px tall, photograph ${hero.photoWidth}px wide`;
  });
  await check('the hero photograph runs wider than the text column at 1440px and edge to edge on a phone, with its title on that column', async () => {
    const measure = () => page.evaluate(() => {
      const box = (selector) => document.querySelector(selector).getBoundingClientRect();
      return {
        left: Math.round(box('.hero__photo').left),
        right: Math.round(box('.hero__photo').right),
        title: Math.round(box('.hero h1').left),
        column: Math.round(box('#picks').left),
        columnRight: Math.round(box('#picks').right),
        window: document.documentElement.clientWidth,
      };
    });
    const wide = await measure();
    assert.ok(wide.left <= HERO_INSET_MAX_PX && wide.window - wide.right <= HERO_INSET_MAX_PX, `at 1440px the photograph spans ${wide.left} to ${wide.right}px`);
    assert.equal(wide.left, wide.window - wide.right, 'the photograph is not centred');
    assert.ok(wide.left < wide.column && wide.right > wide.columnRight, `the photograph spans ${wide.left} to ${wide.right}px, the text column ${wide.column} to ${wide.columnRight}px`);
    assert.ok(Math.abs(wide.title - wide.column) <= 1, `the title starts at ${wide.title}px, the text column at ${wide.column}px`);
    // At 1024px the photograph is no wider than the text column, so the title sits inside it, clear of its edge.
    await page.setViewport(SMALL_LAPTOP);
    const mid = await measure();
    await page.setViewport(PHONE);
    const narrow = await measure();
    await page.setViewport(DESKTOP);
    assert.ok(mid.left <= mid.column && mid.right >= mid.columnRight, `at 1024px the photograph spans ${mid.left} to ${mid.right}px, the text column ${mid.column} to ${mid.columnRight}px`);
    assert.ok(mid.title - mid.left >= 24, `at 1024px the title starts ${mid.title - mid.left}px inside the photograph`);
    assert.deepEqual([narrow.left, narrow.right], [0, narrow.window]);
    return `${wide.right - wide.left}px of ${wide.window}px`;
  });
  await check('hovering a control on a photograph leaves its label readable', async () => {
    await page.setViewport(DESKTOP);
    await page.goto(urlOf('preview-light.html'), { waitUntil: 'load' });
    const colourWhileHovered = async (hoverSelector, textSelector) => {
      await page.hover(hoverSelector);
      return page.$eval(textSelector, (element) => getComputedStyle(element).color);
    };
    const colours = {
      accentButton: await colourWhileHovered('.hero .btn--accent', '.hero .btn--accent'),
      lightButton: await colourWhileHovered('.hero .btn--light', '.hero .btn--light'),
      cardName: await colourWhileHovered('.pick', '.pick .pick__name'),
      cardCount: await colourWhileHovered('.pick', '.pick .pick__count'),
    };
    await page.mouse.move(DESKTOP.width - 1, DESKTOP.height - 1);
    await page.evaluate(() => window.scrollTo(0, 0));
    assert.deepEqual(colours, { accentButton: WHITE, lightButton: PRIMARY_TEXT, cardName: WHITE, cardCount: WHITE });
  });
  await check('a category card on the Overview opens Places on that filter', async () => {
    await page.click('[data-filter-link="guinness"]');
    await viewSettled(page);
    assert.equal(await isShown(page, '#places'), true);
    assert.equal(await page.$eval('#filter-guinness', (radio) => radio.checked), true);
    assert.equal(await textOf(page, '[data-place-count]'), '4 places');
    assert.equal(await shownPlacePhotos(page), 0);
    await page.click('label[for="filter-top"]');
    await page.click('[data-view-link="board"]');
    await viewSettled(page);
  });
  await check('the Plan link switches view, marks itself and moves focus to the view title', async () => {
    await page.click('[data-view-link="plan"]');
    await viewSettled(page);
    assert.equal(await isShown(page, '#plan'), true);
    assert.equal(await isShown(page, '#board'), false);
    assert.equal(await page.$eval('[data-view-link="plan"]', (link) => link.getAttribute('aria-current')), 'page');
    assert.equal(await page.evaluate(() => document.activeElement.id), 'plan-title');
    assert.equal(await page.evaluate(() => location.hash), '#plan');
  });
  await check('day tabs move with ArrowRight, End and Home', async () => {
    await page.setViewport(TABLET);
    assert.deepEqual(await selectedDays(page), ['wed']);
    await page.focus('#tab-wed');
    await page.keyboard.press('ArrowRight');
    assert.equal(await page.evaluate(() => document.activeElement.id), 'tab-thu');
    assert.equal(await isShown(page, '#day-thu'), true);
    assert.equal(await isShown(page, '#day-wed'), false);
    await page.keyboard.press('End');
    assert.equal(await isShown(page, '#day-sun'), true);
    await page.keyboard.press('Home');
    assert.equal(await isShown(page, '#day-wed'), true);
    await page.setViewport(DESKTOP);
  });
  await check('each day carries its own photograph under its title', async () => {
    const days = await page.$$eval('[data-day]', (sections) => sections.map((section) => {
      const image = section.querySelector('.day__head .day__photo');
      return { day: section.dataset.day, src: image ? image.getAttribute('src') : null, alt: image ? image.alt.trim() : '', hasTitle: section.querySelector('.day__head .day__title') !== null };
    }));
    assert.equal(days.length, 5);
    assert.deepEqual(days.filter((day) => !day.src || !day.hasTitle).map((day) => day.day), []);
    assert.equal(new Set(days.map((day) => day.src)).size, 5, 'two days share a photograph');
  });
  await check('places open on twelve top picks as picture cards, and the Guinness filter is a plain list of four', async () => {
    await page.click('[data-view-link="places"]');
    await viewSettled(page);
    assert.equal(await textOf(page, '[data-place-count]'), '12 places');
    assert.equal(await shownPlaces(page), TOP_PICK_COUNT);
    assert.equal(await shownPlacePhotos(page), TOP_PICK_COUNT);
    await page.click('label[for="filter-guinness"]');
    assert.equal(await textOf(page, '[data-place-count]'), '4 places');
    assert.equal(await shownPlaces(page), 4);
    assert.equal(await shownPlacePhotos(page), 0);
  });
  await check('typing a search looks through every place and the count matches the rows', async () => {
    await page.click('label[for="filter-top"]');
    await page.type('#place-search', 'goose');
    const shown = await shownPlaces(page);
    assert.ok(shown >= 2, `expected at least two goose places, saw ${shown}`);
    assert.equal(await textOf(page, '[data-place-count]'), `${shown} places`);
    assert.equal(await page.$eval('#filter-all', (radio) => radio.checked), true);
    return `${shown} places for "goose"`;
  });
  await check('a search with no match shows the empty state, and Clear search restores the list', async () => {
    await page.$eval('#place-search', (input) => { input.value = ''; });
    await page.type('#place-search', 'zzzz');
    assert.equal(await isShown(page, '[data-empty]'), true);
    assert.equal(await textOf(page, '[data-empty-query]'), 'zzzz');
    assert.equal(await textOf(page, '[data-place-count]'), '0 places');
    await page.click('[data-clear-search]');
    assert.equal(await isShown(page, '[data-empty]'), false);
    assert.equal(await textOf(page, '[data-place-count]'), '12 places');
    assert.equal(await page.evaluate(() => document.activeElement.id), 'place-search');
  });
  await check('markup typed into the search is shown as text and never becomes an element', async () => {
    await page.type('#place-search', MARKUP_QUERY);
    assert.equal(await textOf(page, '[data-empty-query]'), MARKUP_QUERY);
    assert.equal(await page.$$eval('img[src="x"]', (images) => images.length), 0);
    await page.click('[data-clear-search]');
  });
  await check('search ignores the words on its own controls and keeps a chosen filter', async () => {
    await page.click('label[for="filter-eat"]');
    await page.type('#place-search', 'maps');
    assert.equal(await shownPlaces(page), 0);
    assert.equal(await page.$eval('#filter-eat', (radio) => radio.checked), true);
    await page.click('[data-clear-search]');
  });
  await check('every place with a location has a one-tap Map link to Google Maps, named after the place', async () => {
    const places = await page.$$eval('[data-place]', (rows) => rows.map((row) => {
      const link = row.querySelector(':scope > .place__map');
      return { name: row.querySelector('.place__name').textContent.trim(), href: link ? link.href : null, label: link ? link.getAttribute('aria-label') : null, linksInRow: row.querySelectorAll('a[href*="google.com/maps"]').length };
    }));
    assert.equal(places.length, PLACE_COUNT);
    assert.deepEqual(places.filter((place) => place.href === null).map((place) => place.name), PLACES_WITHOUT_A_MAP);
    const mapped = places.filter((place) => place.href !== null);
    assert.deepEqual(mapped.filter((place) => !place.href.startsWith(MAPS_LINK) || place.href.length <= MAPS_LINK.length).map((place) => place.name), []);
    assert.deepEqual(mapped.filter((place) => place.label !== `Map, ${place.name}`).map((place) => `${place.name}: ${place.label}`), []);
    assert.deepEqual(mapped.filter((place) => place.linksInRow !== 1).map((place) => place.name), [], 'a row repeats its map link');
    return `${mapped.length} places mapped`;
  });
  await check('a tick updates the count and survives a reload', async () => {
    await page.click('[data-view-link="board"]');
    await viewSettled(page);
    await page.click('#tick-print-par');
    assert.equal(await textOf(page, '[data-done-count]'), '1 of 8 done');
    await page.reload({ waitUntil: 'load' });
    assert.equal(await page.$eval('#tick-print-par', (box) => box.checked), true);
    assert.equal(await textOf(page, '[data-done-count]'), '1 of 8 done');
    await page.click('#tick-print-par');
  });
  await check('a tick that saves raises no storage notice', async () => {
    await page.click('#tick-print-par');
    assert.equal(await textOf(page, '[data-storage-notice]'), '');
    await page.click('#tick-print-par');
    assert.equal(await textOf(page, '[data-storage-notice]'), '');
  });
  await check('the hotel address carries a link to Google Maps', async () => {
    const link = await page.$eval('.address a', (anchor) => ({ href: anchor.href, text: anchor.textContent.trim() }));
    assert.ok(link.href.startsWith(MAPS_LINK) && link.href.includes('Oasis+Aurum+181'), link.href);
    assert.equal(link.text, 'Open in Maps');
  });
  await check('a device that refuses storage still counts a tick and says the ticks are not saved', async () => {
    const tab = await openFresh({ prepare: refuseStorage });
    try {
      assert.equal(await textOf(tab, '[data-storage-notice]'), '');
      await tab.click('#tick-print-par');
      assert.equal(await textOf(tab, '[data-done-count]'), '1 of 8 done');
      assert.equal(await textOf(tab, '[data-storage-notice]'), STORAGE_NOTICE);
      await (await tab.$('#todo')).screenshot({ path: join(shotsDir, 'state-ticks-not-saved-1440.png') });
    } finally {
      await tab.close();
    }
  });
  await check('an hour before the concert the hero counts down to it and the plan opens on Thursday', async () => {
    const tab = await openFresh({ prepare: holdClockAt, argument: Date.parse(HOUR_BEFORE_CONCERT) });
    try {
      assert.equal(await textOf(tab, '[data-countdown]'), '1 hour');
      assert.equal(await textOf(tab, '[data-countdown-caption]'), 'Until FKJ starts.');
      assert.deepEqual(await nextRows(tab), ['concert']);
      assert.deepEqual(await selectedDays(tab), ['thu']);
      await tab.screenshot({ path: join(shotsDir, 'state-hour-before-concert-1440.png') });
    } finally {
      await tab.close();
    }
  });
  await check('in the last minute the hero reads Now and names the event without "Until"', async () => {
    const tab = await openFresh({ prepare: holdClockAt, argument: Date.parse(HALF_MINUTE_BEFORE_CONCERT) });
    try {
      assert.equal(await textOf(tab, '[data-countdown]'), 'Now');
      assert.equal(await textOf(tab, '[data-countdown-caption]'), 'FKJ starts.');
    } finally {
      await tab.close();
    }
  });
  await check('after the flight home has left the hero reads Trip complete and no row is marked', async () => {
    const tab = await openFresh({ prepare: holdClockAt, argument: Date.parse(AFTER_FLIGHT_HOME) });
    try {
      assert.equal(await textOf(tab, '[data-countdown]'), 'Trip complete');
      assert.equal(await textOf(tab, '[data-countdown-caption]'), 'CX420 has left Hong Kong.');
      assert.deepEqual(await nextRows(tab), []);
      assert.deepEqual(await selectedDays(tab), ['sun']);
      await tab.screenshot({ path: join(shotsDir, 'state-after-the-trip-1440.png') });
    } finally {
      await tab.close();
    }
  });
  await check('the page carries no preview switcher and an old #preview link opens the Overview', async () => {
    const tab = await openFresh({ hash: '#preview' });
    try {
      assert.equal(await tab.$$eval('[data-preview], [data-preview-state]', (nodes) => nodes.length), 0);
      assert.equal(await isShown(tab, '#board'), true);
      assert.equal(await isShown(tab, '#plan'), false);
    } finally {
      await tab.close();
    }
  });
  await check('a deep link to a view keeps its title in sight', async () => {
    for (const viewport of [DESKTOP, PHONE]) {
      for (const viewId of VIEW_IDS) {
        const tab = await openFresh({ hash: `#${viewId}` });
        try {
          await tab.setViewport(viewport);
          await tab.reload({ waitUntil: 'load' });
          const title = await tab.evaluate((view) => {
            const heading = [...document.querySelectorAll('[data-view-title]')].find((element) => element.closest('[data-view]').dataset.view === view);
            const box = heading.getBoundingClientRect();
            const bar = document.querySelector('.nav').getBoundingClientRect();
            return { top: Math.round(box.top), bottom: Math.round(box.bottom), barBottom: Math.round(bar.bottom) };
          }, viewId);
          assert.ok(title.top >= title.barBottom && title.bottom <= viewport.height, `${viewId} at ${viewport.width}px: title spans ${title.top} to ${title.bottom}, the bar ends at ${title.barBottom}`);
        } finally {
          await tab.close();
        }
      }
    }
  });
  await check('keyboard focus shows a ring of at least 2px', async () => {
    await page.goto(urlOf('preview-light.html'), { waitUntil: 'load' });
    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab');
    const ring = await page.evaluate(() => {
      const style = getComputedStyle(document.activeElement);
      return { tag: document.activeElement.className, style: style.outlineStyle, width: parseFloat(style.outlineWidth) };
    });
    assert.notEqual(ring.style, 'none');
    assert.ok(ring.width >= 2, `ring is ${ring.width}px`);
    return `${ring.tag}: ${ring.style} ${ring.width}px`;
  });
  await check('nothing runs past the window from 320px to 1440px, with every disclosure open', async () => {
    for (const viewport of [NARROW_PHONE, SMALL_PHONE, PHONE, HALF_DESKTOP, TABLET, SMALL_LAPTOP, LAPTOP, DESKTOP]) {
      await page.setViewport(viewport);
      for (const viewId of VIEW_IDS) {
        await page.goto(urlOf('preview-light.html', `#${viewId}`), { waitUntil: 'load' });
        if (viewId === 'places') {
          await page.click('label[for="filter-all"]');
        }
        await openEverything(page);
        assert.deepEqual(await pastTheWindow(page), [], `${viewId} at ${viewport.width}px`);
      }
    }
    await page.setViewport(DESKTOP);
    await page.goto(urlOf('preview-light.html', '#places'), { waitUntil: 'load' });
    await page.click('label[for="filter-top"]');
  });

  await page.setViewport(DESKTOP);
  const typeAcrossViews = [];
  for (const viewId of VIEW_IDS) {
    await page.goto(urlOf('preview-light.html', `#${viewId}`), { waitUntil: 'load' });
    await page.reload({ waitUntil: 'load' });
    if (viewId === 'places') {
      await page.click('label[for="filter-all"]');
    }
    await openEverything(page);
    typeAcrossViews.push(...(await typeInUse(page)).map((entry) => ({ ...entry, view: viewId })));
  }
  await page.goto(urlOf('preview-light.html', '#places'), { waitUntil: 'load' });
  await page.click('label[for="filter-top"]');
  const describe = (entries) => entries.map((entry) => `${entry.view}: "${entry.sample}" ${entry.size}px ${entry.weight} ${entry.slant} ${entry.spacing}`);
  const sizeLimit = (entry) => (entry.isDisplay ? MAX_DISPLAY_PX : entry.isAddress ? MAX_ADDRESS_PX : MAX_TEXT_PX);
  await check('no text is set above 32px at 1440px, except the hero title (72px) and the address for the driver (48px)', async () => {
    for (const viewId of VIEW_IDS) {
      assert.ok(typeAcrossViews.filter((entry) => entry.view === viewId).length >= 3, `too little text was measured on ${viewId}`);
    }
    assert.deepEqual(describe(typeAcrossViews.filter((entry) => entry.size > sizeLimit(entry))), []);
    return `${typeAcrossViews.length} type settings measured`;
  });
  await check('text uses weights 400, 600 and 700 only', async () => {
    assert.deepEqual(describe(typeAcrossViews.filter((entry) => !ALLOWED_WEIGHTS.includes(entry.weight))), []);
  });
  await check('no text has hand-set letter-spacing', async () => {
    assert.deepEqual(describe(typeAcrossViews.filter((entry) => entry.spacing !== 'normal')), []);
  });
  await check('no text is italic', async () => {
    assert.deepEqual(describe(typeAcrossViews.filter((entry) => entry.slant !== 'normal')), []);
  });
  await check('the page is white and its text is the primary grey', async () => {
    const colours = await page.evaluate(() => ({ background: getComputedStyle(document.body).backgroundColor, text: getComputedStyle(document.body).color }));
    assert.deepEqual(colours, { background: WHITE, text: PRIMARY_TEXT });
  });
  await check('every description is set smaller than its title at 1440px and at 375px', async () => {
    for (const viewport of [DESKTOP, PHONE]) {
      await page.setViewport(viewport);
      await page.goto(urlOf('preview-light.html', '#board'), { waitUntil: 'load' });
      for (const pair of await titlePairs(page)) {
        assert.ok(pair.found >= pair.minimum, `${pair.selector}: ${pair.found} pairs found at ${viewport.width}px, expected at least ${pair.minimum}`);
        assert.deepEqual(pair.offenders, [], `${pair.selector} at ${viewport.width}px`);
      }
    }
  });
  await check('on a phone every control is at least 44px in both directions', async () => {
    await page.setViewport(PHONE);
    const offenders = [];
    let measured = 0;
    for (const [viewId, selectors] of Object.entries(TOUCH_CONTROLS)) {
      await page.goto(urlOf('preview-light.html', `#${viewId}`), { waitUntil: 'load' });
      if (viewId === 'board') {
        await page.$eval('.credits', (details) => {
          details.open = true;
        });
      }
      if (viewId === 'places') {
        await page.click('[data-place]:not([hidden]) summary');
        await page.screenshot({ path: join(shotsDir, 'state-place-open-375.png') });
      }
      if (viewId === 'info') {
        await page.click('.qa summary');
      }
      const result = await smallControls(page, selectors.filter((selector) => selector !== '[data-clear-search]'));
      offenders.push(...result.offenders.map((offender) => `${viewId}: ${offender}`));
      measured += result.measured;
      if (viewId === 'places') {
        await page.type('#place-search', 'zzzz');
        const emptyState = await smallControls(page, ['[data-clear-search]']);
        offenders.push(...emptyState.offenders.map((offender) => `${viewId}: ${offender}`));
        measured += emptyState.measured;
        await page.screenshot({ path: join(shotsDir, 'state-no-match-375.png') });
        await page.click('[data-clear-search]');
      }
    }
    assert.ok(measured >= 40, `only ${measured} controls were measured`);
    assert.deepEqual(offenders, []);
    return `${measured} controls`;
  });
  await check('a chip chosen at the far end of the row stays in sight on a phone', async () => {
    await page.setViewport(PHONE);
    await page.goto(urlOf('preview-light.html', '#places'), { waitUntil: 'load' });
    await page.focus('#filter-top');
    for (let presses = 0; presses < 8; presses += 1) {
      await page.keyboard.press('ArrowRight');
    }
    const chip = await page.$eval('label[for="filter-all"]', (label) => {
      const box = label.getBoundingClientRect();
      return { left: Math.round(box.left), right: Math.round(box.right), isChecked: label.querySelector('input').checked };
    });
    assert.equal(chip.isChecked, true);
    assert.ok(chip.left >= 0 && chip.right <= PHONE.width, `the chosen chip spans ${chip.left} to ${chip.right}px`);
    await page.click('label[for="filter-top"]');
  });
  await check('four views fit in one row on a 360px phone with no clipped label', async () => {
    await page.setViewport(SMALL_PHONE);
    await page.goto(urlOf('preview-light.html', '#board'), { waitUntil: 'load' });
    const tabs = await page.$$eval('.nav__link', (links) => links.map((link) => ({ top: Math.round(link.getBoundingClientRect().top), isClipped: link.scrollWidth > link.clientWidth })));
    assert.equal(tabs.length, VIEW_IDS.length);
    assert.equal(new Set(tabs.map((tab) => tab.top)).size, 1, 'the links wrap onto more than one row');
    assert.deepEqual(tabs.filter((tab) => tab.isClipped), []);
  });
  await check('from 1024px the fixed times sit beside the to-do list, and below it on a phone', async () => {
    for (const viewport of [SMALL_LAPTOP, DESKTOP]) {
      await page.setViewport(viewport);
      await page.goto(urlOf('preview-light.html', '#board'), { waitUntil: 'load' });
      const wide = await sectionBoxes(page, ['todo', 'times']);
      assert.ok(wide.times.left >= wide.todo.left + SIDE_COLUMN_OFFSET_PX, `at ${viewport.width}px the times start at ${wide.times.left}px, the to-do list at ${wide.todo.left}px`);
      assert.equal(wide.times.top, wide.todo.top, `at ${viewport.width}px the two cards do not start level`);
    }
    await page.setViewport(PHONE);
    const narrow = await sectionBoxes(page, ['todo', 'times']);
    assert.equal(narrow.times.left, narrow.todo.left);
    assert.ok(narrow.times.top >= narrow.todo.bottom, 'the times overlap the to-do list');
  });
  await check('from 1024px the bookings sit beside the day plan', async () => {
    await page.setViewport(DESKTOP);
    await page.goto(urlOf('preview-light.html', '#plan'), { waitUntil: 'load' });
    const boxes = await sectionBoxes(page, ['day-wed', 'booked']);
    assert.ok(boxes.booked.left >= boxes['day-wed'].left + SIDE_COLUMN_OFFSET_PX, `bookings start at ${boxes.booked.left}px, the day at ${boxes['day-wed'].left}px`);
    assert.ok(Math.abs(boxes.booked.top - boxes['day-wed'].top) <= 4, `the bookings start at ${boxes.booked.top}px, the day at ${boxes['day-wed'].top}px`);
  });
  await check('the top bar holds the four views and no search box', async () => {
    await page.setViewport(DESKTOP);
    await page.goto(urlOf('preview-light.html'), { waitUntil: 'load' });
    assert.deepEqual(await page.$$eval('.nav [data-view-link]', (links) => links.map((link) => link.textContent.trim())), ['Overview', 'Plan', 'Places', 'Info']);
    assert.equal(await page.$$eval('.nav input, .nav form', (controls) => controls.length), 0);
  });
  await check('switching view does not move the other links in the bar', async () => {
    const lefts = () => page.$$eval('.nav__link', (links) => links.map((link) => Math.round(link.getBoundingClientRect().left)));
    const before = await lefts();
    await page.click('[data-view-link="info"]');
    await viewSettled(page);
    assert.deepEqual(await lefts(), before);
  });
  await check('the footer sits at the bottom of the window on a short view', async () => {
    const gap = await page.evaluate(() => Math.round(window.innerHeight - document.querySelector('.footer').getBoundingClientRect().bottom));
    assert.ok(gap <= 0, `${gap}px of empty page below the footer`);
  });
  await check('Back returns from Plan to the Overview', async () => {
    await page.goto(urlOf('preview-light.html'), { waitUntil: 'load' });
    await page.click('[data-view-link="plan"]');
    await viewSettled(page);
    await page.goBack();
    assert.equal(await isShown(page, '#board'), true);
    assert.equal(await isShown(page, '#plan'), false);
    assert.equal(await page.$eval('[data-view-link="board"]', (link) => link.getAttribute('aria-current')), 'page');
  });
  await check('a day link opens the Plan view on that day and moves focus to it', async () => {
    await page.goto(urlOf('preview-light.html'), { waitUntil: 'load' });
    await page.evaluate(() => { location.hash = 'day-sat'; });
    await page.waitForFunction(() => document.activeElement !== null && document.activeElement.id === 'day-sat', { timeout: 3000 });
    assert.equal(await isShown(page, '#plan'), true);
    assert.deepEqual(await selectedDays(page), ['sat']);
  });
  await check('a day link on a phone keeps the day tabs in view below the bar', async () => {
    await page.setViewport(PHONE);
    await page.goto(urlOf('preview-light.html', '#day-fri'), { waitUntil: 'load' });
    const box = await page.$eval('#tab-fri', (tab) => {
      const rect = tab.getBoundingClientRect();
      return { top: Math.round(rect.top), bottom: Math.round(rect.bottom) };
    });
    const navBottom = await page.$eval('.nav', (nav) => Math.round(nav.getBoundingClientRect().bottom));
    assert.equal(await page.$eval('#tab-fri', (tab) => tab.getAttribute('aria-selected')), 'true');
    assert.ok(box.top >= navBottom && box.bottom <= PHONE.height, `tab spans ${box.top} to ${box.bottom}, the bar ends at ${navBottom}`);
  });
  await check('the page stays bright even when the host and the system ask for dark', async () => {
    await page.setViewport(DESKTOP);
    await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'dark' }, REDUCED_MOTION]);
    await page.goto(urlOf('preview.html'), { waitUntil: 'load' });
    const colour = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'light' }, REDUCED_MOTION]);
    assert.equal(colour, WHITE);
    return colour;
  });
  await check('white text on every photograph keeps its WCAG contrast against the bright end of what lies behind it', async () => {
    const probe = await browser.newPage();
    // A new tab opens in front. The page under test comes back to the front, so its pictures are taken as painted.
    await page.bringToFront();
    const failures = [];
    let measured = 0;
    let lowest = Infinity;
    try {
      for (const viewport of [DESKTOP, SMALL_LAPTOP, TABLET, PHONE]) {
        await page.setViewport(viewport);
        for (const viewId of [...new Set(TEXT_ON_PHOTOS.map((entry) => entry.view))]) {
          await page.goto(urlOf('preview-light.html', `#${viewId}`), { waitUntil: 'load' });
          await page.reload({ waitUntil: 'load' });
          await openEverything(page);
          await loadEveryPhotograph(page);
          // The contrast below is worked out for white text, so the text must be white before it is hidden.
          const selectorsHere = TEXT_ON_PHOTOS.filter((entry) => entry.view === viewId).map((entry) => entry.selector);
          const notWhite = await page.evaluate((selectors) => selectors.filter((selector) => [...document.querySelectorAll(selector)].some((element) => getComputedStyle(element).color !== 'rgb(255, 255, 255)')), selectorsHere);
          assert.deepEqual(notWhite, [], `text on a photograph is not white at ${viewport.width}px`);
          // The text is made transparent, so the picture taken of its box shows only what lies behind it.
          await page.addStyleTag({ content: `${TEXT_ON_PHOTOS.map((entry) => entry.selector).join(', ')} { color: transparent !important; }` });
          for (const { selector, minimum } of TEXT_ON_PHOTOS.filter((entry) => entry.view === viewId)) {
            for (const handle of await page.$$(selector)) {
              const [bright, brightest] = await probe.evaluate(luminanceAtPercentiles, await handle.screenshot({ encoding: 'base64' }), [BRIGHT_PERCENTILE, BRIGHT_TAIL_PERCENTILE]);
              const ratio = 1.05 / (bright + 0.05);
              const tailRatio = 1.05 / (brightest + 0.05);
              measured += 1;
              lowest = Math.min(lowest, ratio);
              if (ratio < minimum) {
                failures.push(`${selector} at ${viewport.width}px: ${ratio.toFixed(2)}:1, needs ${minimum}:1`);
              }
              if (minimum > LARGE_TEXT_CONTRAST && tailRatio < LARGE_TEXT_CONTRAST) {
                failures.push(`${selector} at ${viewport.width}px: ${tailRatio.toFixed(2)}:1 at its brightest hundredth, needs ${LARGE_TEXT_CONTRAST}:1`);
              }
            }
          }
        }
      }
    } finally {
      await probe.close();
      await page.setViewport(DESKTOP);
    }
    assert.ok(measured >= 76, `only ${measured} text boxes were measured`);
    assert.deepEqual(failures, []);
    return `${measured} text boxes, lowest ${lowest.toFixed(2)}:1`;
  });
  await check('every photograph loads, is used once and has its own credit, and only the two that inform carry a description', async () => {
    await page.goto(urlOf('preview-light.html', '#board'), { waitUntil: 'load' });
    await loadEveryPhotograph(page);
    const report = await page.evaluate(() => {
      const images = [...document.images];
      const fileOf = (image) => image.getAttribute('src').replace('images/', '');
      const files = images.map(fileOf);
      const credits = [...document.querySelectorAll('[data-credits] li')];
      const creditedFiles = credits.map((item) => item.dataset.creditFor).filter(Boolean);
      return {
        broken: images.filter((image) => image.naturalWidth === 0).map(fileOf),
        withoutAltAttribute: images.filter((image) => !image.hasAttribute('alt')).map(fileOf),
        described: images.filter((image) => image.alt.trim() !== '').map((image) => image.className).sort(),
        repeated: files.filter((file, index) => files.indexOf(file) !== index),
        uncredited: files.filter((file) => !creditedFiles.includes(file)),
        creditsWithoutPhotograph: creditedFiles.filter((file) => !files.includes(file)),
        repeatedCredits: creditedFiles.filter((file, index) => creditedFiles.indexOf(file) !== index),
        otherCredits: credits.filter((item) => !item.dataset.creditFor).map((item) => item.textContent.trim().slice(0, 13)),
        commonsWithoutLicenceLink: credits.filter((item) => item.querySelector('a[href^="https://commons.wikimedia.org/"]') && !item.querySelector('a[rel~="license"][href^="https://creativecommons.org/"]')).map((item) => item.dataset.creditFor),
        files: files.length,
      };
    });
    assert.deepEqual(report.broken, []);
    assert.deepEqual(report.withoutAltAttribute, []);
    // A picture beside its own label adds nothing for a screen reader: only the hero and the taxi photograph say something new.
    assert.deepEqual(report.described, ['hero__photo', 'photo__img']);
    assert.deepEqual(report.repeated, [], 'a photograph is used more than once');
    assert.deepEqual(report.uncredited, [], 'a photograph has no credit of its own');
    assert.deepEqual(report.creditsWithoutPhotograph, [], 'a credit names a photograph the page does not show');
    assert.deepEqual(report.repeatedCredits, []);
    assert.deepEqual(report.otherCredits, ['Icons: Lucide']);
    assert.deepEqual(report.commonsWithoutLicenceLink, [], 'a Wikimedia Commons credit does not link its licence');
    assert.equal(report.files, 25);
    return `${report.files} photographs`;
  });

  // Each view is loaded afresh with the pointer parked in a corner, so no picture catches a hover or a moved focus.
  for (const viewId of VIEW_IDS) {
    for (const viewport of [PHONE, TABLET, DESKTOP]) {
      await page.setViewport(viewport);
      await page.mouse.move(viewport.width - 1, viewport.height - 1);
      await page.goto(urlOf('preview-light.html', `#${viewId}`), { waitUntil: 'networkidle0' });
      await page.reload({ waitUntil: 'networkidle0' });
      await loadEveryPhotograph(page);
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.screenshot({ path: join(shotsDir, `${viewId}-${viewport.width}.png`), fullPage: true });
    }
  }

  const plainPage = await browser.newPage();
  await plainPage.setJavaScriptEnabled(false);
  await plainPage.setViewport(LAPTOP);
  await plainPage.goto(urlOf('preview-light.html'), { waitUntil: 'load' });
  await check('with scripting off every view, day and place is readable and dead controls are hidden', async () => {
    for (const viewId of VIEW_IDS) {
      assert.equal(await isShown(plainPage, `#${viewId}`), true, `${viewId} is hidden`);
    }
    assert.equal(await plainPage.$$eval('[data-day]', (days) => days.filter((day) => day.getClientRects().length > 0).length), 5);
    assert.equal(await plainPage.$$eval('[data-place]', (places) => places.filter((place) => place.getClientRects().length > 0).length), PLACE_COUNT);
    assert.equal(await isShown(plainPage, '.tools'), false);
    assert.equal(await isShown(plainPage, '.switch__tabs'), false);
    assert.equal(await shownPlacePhotos(plainPage), 0);
    // With no script to keep it right, the countdown tile would only repeat the flight: it is hidden.
    assert.equal(await isShown(plainPage, '.tile--next'), false);
    assert.equal(await plainPage.$$eval('.glance .tile', (tiles) => tiles.filter((tile) => tile.getClientRects().length > 0).length), 3);
  });
  await check('with scripting off the four views follow each other down the page at 1280px, no block over another', async () => {
    const blocks = await plainPage.$$eval('[data-view]', (elements) => elements.map((element) => {
      const box = element.getBoundingClientRect();
      return { view: element.dataset.view, id: element.id || element.className, top: Math.round(box.top + scrollY), bottom: Math.round(box.bottom + scrollY) };
    }));
    assert.deepEqual([...new Set(blocks.map((block) => block.view))], VIEW_IDS);
    assert.ok(blocks.length >= 7, `only ${blocks.length} blocks were found`);
    for (let index = 1; index < blocks.length; index += 1) {
      assert.ok(blocks[index].top >= blocks[index - 1].bottom, `${blocks[index].id} starts at ${blocks[index].top}px, before ${blocks[index - 1].id} ends at ${blocks[index - 1].bottom}px`);
    }
  });
  await check('no tab raised a script error in any check or screenshot', async () => {
    assert.deepEqual(pageErrors, []);
  });
} finally {
  await browser.close();
}

for (const { name, ok, note } of results) {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${note ? ` [${note}]` : ''}`);
}
const failed = results.filter((result) => !result.ok).length;
console.log(`# e2e checks ${results.length}, pass ${results.length - failed}, fail ${failed}`);
process.exit(failed === 0 ? 0 : 1);
