# Hong Kong trip board

A small static site for a four-night trip to Hong Kong, 2 to 6 December 2026. It holds an overview with a countdown, a day-by-day plan, places to eat, drink and see with map links, and practical notes.

Live: https://impravin22.github.io/hk-trip-board/

## How it is built

Plain HTML, CSS and JavaScript. No framework, and no build step while you work on it.

| Path | What it is |
| --- | --- |
| `index.html` | The page, as a fragment: its head tags, then the body content. |
| `tokens.css`, `base.css`, `site.css` | Design tokens, the reset and the page styles. |
| `trip-logic.js` | Pure functions: countdown, day selection, search, filters and saved ticks. |
| `trip.js` | Page wiring. The page reads in full without it. |
| `images/` | 25 photographs, with their credits in `credits.json`. |
| `tools/build-pages.mjs` | Wraps the fragment in a complete document for a plain web host. |
| `tools/build-preview.mjs` | Builds the local preview documents that the browser checks open. |
| `tests/` | Unit tests and browser checks. |

## Run the checks

Unit tests need only Node 22 or later:

```bash
node --test tests/*.test.js
```

The browser checks also need Chrome and a `puppeteer-core` install. Nothing is installed by this repository:

```bash
PUPPETEER_CORE=/path/to/node_modules/puppeteer-core node tests/e2e.mjs
```

To run the same checks against the document that is deployed, build it first and point the checks at it:

```bash
node tools/build-pages.mjs /tmp/trip-site
E2E_LIGHT_PAGE=/tmp/trip-site/index.html PUPPETEER_CORE=/path/to/node_modules/puppeteer-core node tests/e2e.mjs
```

## Deploy

Every push to `main` runs the unit tests, builds the site with `tools/build-pages.mjs` and publishes it to GitHub Pages. The workflow is `.github/workflows/pages.yml`. The browser checks do not run there.

## Privacy

The page names a hotel and travel dates. It carries no booking references, and it asks search engines not to list it. The address is still public: anyone who has it can read the page.

## Photographs

All 25 photographs come from Wikimedia Commons, under CC0, CC BY or CC BY-SA. Each is credited with its author, source and licence in the page footer and in `images/credits.json`. They are cut and resized, and those adapted copies stay under the same licences.

Icons are from Lucide, under the ISC licence.
