# Media Studio

A local, serverless React 19 + Vite 8 application for turning public event calendars into editable Instagram schedules. The entire application runs in the browser. No accounts, API keys, backend, proxy, or upload service are required.


## GitHub Pages

Live app: **https://projects.ahmadjalil.com/mediakit/**  
Repository: **https://github.com/ahzs645/mediakit**

[![Test and deploy Media Studio](https://github.com/ahzs645/mediakit/actions/workflows/deploy-pages.yml/badge.svg)](https://github.com/ahzs645/mediakit/actions/workflows/deploy-pages.yml)

The workflow in `.github/workflows/deploy-pages.yml` runs the unit/layout tests, builds with Node 24, and deploys `dist/` to GitHub Pages on every push to `main`. Pull requests run tests and build without deploying. You can also trigger a deployment manually from the Actions tab. Pages uses **GitHub Actions** as its publishing source.

`VITE_BASE_PATH` sets the repository subdirectory for published assets, fonts, artwork, and the service worker. Local development keeps its relative base. Offline caches are scoped to the app path, so other GitHub Pages projects on the same account do not replace this app’s cache.

The hosted app still keeps edits and project data in your browser. Use **Save project → Open project** to move an existing localhost project to the hosted app; browsers store them as separate origins.

## Run locally

Use Node.js 22.12 or newer (tested with Node 26).

```sh
npm install
npm run dev
```

Open **http://127.0.0.1:5173/**. Keep that terminal running while using the development version.

For the production build, including offline support:

```sh
npm run build
npm run preview
```

Open the URL printed by Vite (normally http://127.0.0.1:4173/). The browser caches the application, artwork, and fonts after the first successful load. Cached events and edits remain usable offline; refreshing live event data requires a connection. Workspaces are stored per browser and origin, so use **Save project → Open project** to move between development and preview, another browser, or another device.

## Workflow

1. Choose a week and Weekdays or Weekend. Vancouver time is used consistently, with B.C.’s permanent UTC−7 rule from March 8, 2026 and historical daylight-saving changes before then.
2. Filter events by **source website** and **label**, or search. Source websites come from the original event website in the calendar metadata.
3. Use a date chip to focus a day. Uncheck a date to omit it from the design. **Fill** suggests an event for one date; **Pick one per day** respects source, label, and search filters. All suggestions remain editable.
4. Select events. The pencil opens a compact editor with independent Title, Time, Location, and Description visibility controls. Edits never modify the source website. Simplify uses a deterministic first-sentence summary locally.
5. Choose Post, Story, or Original, a palette, and field visibility. **Skip empty dates** omits days without selected events; remaining date boxes expand automatically.
6. Review the live preview and **Layout capacity**. Export a PNG, JPG, or self-contained SVG. Download all slides includes a ZIP and caption with source links.
7. Work saves locally. Download a project JSON backup to keep a portable copy or continue on another device.

On mobile, **Events**, **Preview**, and **Design & export** are separate tabs. The date, source, and label controls remain in the Events tab.

B.C.’s [official permanent-time change](https://www2.gov.bc.ca/gov/content/governments/celebrating-british-columbia/daylight-saving-time) is handled explicitly so older browser time-zone databases do not move winter events by one hour.

## Layout and overflow

The renderer measures the actual vector-font width of each line, wraps titles, details, and descriptions, then calculates each event's height from its visible fields and text scale. Capacity is a pixel budget, rather than a fixed event count. The capacity panel shows usage and slides per date.

- Whole events move to another slide when their day box is full. Events are never split mid-entry.
- Busy dates create synchronized additional slides. Every selected occurrence is included.
- An individual entry taller than its box, an entirely hidden event, a cancelled/postponed selection, unsupported font symbols, or more than 10 slides blocks export with an explanation.
- Decorative frames also clip content as a final containment boundary; a blocking warning prevents exporting a known oversized entry.
- Skipped dates keep their selections in the project, so re-enabling a date restores them. Skipped dates do not appear in the image or caption.
- Month/year stamps follow the dates actually shown. Cross-month and cross-year schedules show both values.
- Midnight end times are exclusive. Multi-day events appear on each overlapping visible date. Duplicate occurrence IDs are deduplicated while fetching pages.

Output sizes: **Post 1080×1350**, **Story 1080×1920**, and **Original 964×1302** (exactly 2× the supplied 482×651 SVG dimensions). Supplied art proportions are preserved; the small ratio difference is filled with matching background rather than stretching the artwork. Weekend Stories use two tall date boxes reconstructed from the original weekend vectors and the supplied screenshot.

## Design fidelity and overlay analysis

Original files are preserved in `design-reference/`. `scripts/prepare-designs.py` separates the original background, title, textures, and badges into reusable semantic SVG layers. The title and decorative artwork remain original vector paths. Figma’s `plus-darker` badge blending is adapted to browser-supported `multiply` so the embedded crumpled-paper texture survives SVG-to-canvas exports. Dates are dynamic text converted to paths using bundled fonts; these date letters approximate the original outlined lettering, since editable source fonts were not included.

The reproducible aligned overlay report is in **[docs/visual-comparison/index.html](docs/visual-comparison/index.html)**, including reference, output, overlay opacity control, difference images, measurement exclusions, and numeric results.

Regenerate after artwork changes:

```sh
python3 scripts/prepare-designs.py
# with npm run dev running:
node scripts/compare-designs.mjs
```

Changing the number of dates intentionally reflows the layout and will differ from a static five/two-day reference.

## Calendar adapters

The default connection reads the same public endpoint used by the Over the Edge calendar:

`https://overtheedge.unbc.ca/wp-json/unbc-events/v1/events/`

The app follows `pagination.hasMore` / `nextPage` (or page totals) and joins `eventMetadata` by occurrence ID, preserving venues, categories, status, and source links. The live browser test verifies cross-origin access without cookies or authentication. WordPress shortcodes and HTML are removed before editing/rendering.

The connection settings also support:

- **UNBC / Campus Manager:** its events and metadata envelope.
- **WordPress The Events Calendar:** `/wp-json/tribe/events/v1/events`; UTC timestamps, venues, categories, and pagination.
- **Generic JSON:** an array, or `{ "events": [...] }`, with `id`, `title`, `start`, and optionally `end`, `description`, `location`, `category`, `url`, and `allDay`. Use ISO timestamps with a UTC `Z` or explicit offset. Optional `pages` or `pagination` supports multiple pages.

A third-party API must allow browser cross-origin requests (CORS). This cannot be fixed from a purely static client. The app presents connection errors and keeps the last saved workspace available. Only one API connection is active per project; its upstream websites can be filtered individually. Save different projects for different calendar connections.

## Verification

```sh
npm test
npm run test:e2e
npm run build
# after npm run preview is serving the build:
npm run test:offline
```

Browser tests use installed Google Chrome (`channel: 'chrome'`). They cover actual browser downloads and inspect PNG/JPG/SVG sizes, palette pixels, ZIP contents, captions, editing, project backup/restore, refresh, pagination, date changes, mobile tabs, source/label filters, skipped days, field visibility, cancellation, and connection failures. One integration test calls the real UNBC API and therefore requires the site to be reachable.

The production offline check reloads with the network disabled and verifies a real PNG download. The offline shell is generated during build by `scripts/build-offline.mjs`. Production files in `dist/` can be served by any static HTTP server; opening `index.html` directly with `file://` is unsupported because browser modules, local fetches, and service workers need an HTTP origin.

## Source map

- `src/api.ts`: API adapters, pagination, normalization, and text cleaning.
- `src/dates.ts`: date ranges, local dates, time labels, DST, and multi-day overlap.
- `src/render.ts`: vector layout, capacity, reflow, image/ZIP exports, and captions.
- `src/storage.ts`: versioned local project persistence and backup validation.
- `src/App.tsx`: event picker, filters, date controls, preview, and editors.
- `src/styles.css`: compact desktop workspace and tabbed mobile layout.
