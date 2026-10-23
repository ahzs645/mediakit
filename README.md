# Media Studio

A local, serverless React 19 + Vite 8 application for turning public event calendars into editable Instagram schedules. The entire application runs in the browser. No accounts, API keys, backend, proxy, or upload service are required.


## GitHub Pages

Live app: **https://projects.ahmadjalil.com/mediakit/**  
Repository: **https://github.com/ahzs645/mediakit**

[![Test and deploy Media Studio](https://github.com/ahzs645/mediakit/actions/workflows/deploy-pages.yml/badge.svg)](https://github.com/ahzs645/mediakit/actions/workflows/deploy-pages.yml)

The workflow in `.github/workflows/deploy-pages.yml` runs unit/layout tests and touch workflows in Chrome and WebKit, builds with Node 24, and deploys `dist/` to GitHub Pages on every push to `main`. Pull requests run tests and build without deploying. You can also trigger a deployment manually from the Actions tab. Pages uses **GitHub Actions** as its publishing source.

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
3. Date chips only browse events for a day; they never hide a date or remove selections. Each day has a separate **In design** checkbox for omitting that date. **Selected only** explicitly filters the event list, with a **Show all events** action to return to browsing.
4. Select as many event cards as needed, including multiple events per date. **Select all** adds every matching event for a date. **Suggest** adds the next unselected event; **Add suggestions** adds one new event per visible, included date. Suggestions respect source, label, and search filters and preserve all earlier selections, including selections from other views. The pencil opens a compact editor with independent Title, Time, Location, and Description visibility controls. Edits never modify the source website. Simplify uses a deterministic first-sentence summary locally.
5. Choose **Original cards** or **Weekly list**, then Post, Story, or Original, a palette, and field visibility. Weekly list starts with all seven days in Story format and times off; use Weekdays, Weekend, or Full week and enable times if wanted. **Spacing & date badges** moves the heading and month badge independently and adjusts day badge height. **Skip empty dates** omits days without selected events; remaining date boxes expand automatically.
6. Review the live preview and **Layout capacity**. The slide counter shows which image you are viewing. If the original cards have room for one event per date, extra selections go onto additional slides; the visible notice shows total selections, slide count, and how many events appear on the current slide. Export a PNG, JPG, or self-contained SVG. Download all slides includes a ZIP and caption with source links.
7. Work saves locally. Download a project JSON backup to keep a portable copy or continue on another device.

On mobile, four persistent bottom tabs keep the workflow within reach: **Events → Design → Preview → Export**. Source and label filters expand from **Filters**, with an active-filter count. Date chips scroll horizontally when seven days need more room. Each panel keeps its scroll position and selections when switching tabs. The preview fits its actual export ratio, and the Export tab downloads images or ZIPs directly. **⋯** opens project backup, restore, and help.

Phone controls use larger touch targets and 16px form inputs. Safe-area padding supports notches and home indicators. The layout follows the visual viewport when the keyboard opens; event editors keep a sticky save action. Short phones and landscape use a scrollable panel while retaining the bottom tabs. Desktop keeps its three-column workspace.

[Events on mobile](docs/mobile-events.png) · [Design on mobile](docs/mobile-design.png) · [Export on mobile](docs/mobile-export.png)

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

Output sizes: **Post 1080×1350**, **Story 1080×1920**, and **Original 964×1302** (exactly 2× the supplied 482×651 SVG dimensions). Supplied art proportions are preserved; the small ratio difference is filled with matching background rather than stretching the artwork. Weekday and weekend Stories both use their original supplied SVG artwork. The preview keeps the exact export aspect ratio at desktop and mobile sizes, without adding blank bands.

## Weekly list mode

The additional style follows the supplied seven-day examples: a heavy condensed heading, full weekday names with large date numerals in a separate left column, green outlines, bold event titles, italic venues in parentheses, and a faint repeating background. The date range, month, and year update automatically.

Rows share a measured height budget based on their content. Short events can fit several per date on one slide; longer days receive more space. When the page fills, whole events continue on subsequent slides. Oversized individual events, invisible entries, unsupported symbols, and cancelled events still block export with an explanation. Weekday, weekend, and full-week ranges work in every export size. Skipped/empty dates reflow, field edits carry across styles, and backups preserve the chosen template.

[Weekly list workspace](docs/weekly-list-studio.png) · [Example export](docs/weekly-list-example.png)

## Design fidelity and overlay analysis

Original files, including the new `Section 1.svg` montage, are preserved in `design-reference/`. `scripts/prepare-designs.py` separates headings, month stamps, frame geometry, badge silhouettes, and embedded paper photographs into semantic SVG layers. The weekend Story is extracted directly from the new montage.

The repeating background uses one complete original eleven-letter logo on the original staggered lattice. It continues across the entire canvas, including aspect-ratio padding; duplicate logos in the supplied watermark are removed. Day badges tint the original paper image directly through an SVG colour filter, so their texture survives preview, PNG, JPG, and SVG export without depending on blend-mode support. Badges default to 120% height, with a 100–150% control.

The default heading and last frame use a consistent 4% top/bottom canvas margin. Heading and month positions can move independently from −2% to +1% of canvas height. Settings are saved in project backups, with backward-compatible defaults for older projects.

October 2026 uses the exact supplied Salted vector outlines in every layout. Other months and years remain automatic, using Kalam by default. **Use a local font** loads an OTF, TTF, or WOFF (up to 1 MB), such as Salted, for dynamic months. Local fonts stay in this browser, work offline, and are excluded from project backups and deployments. The separately downloaded Salted file is marked personal use only and is not redistributed in this repository. Day numbers use bundled Barlow Condensed.

The reproducible aligned overlay report is in **[docs/visual-comparison/index.html](docs/visual-comparison/index.html)**, including four original references, output, an overlay opacity control, difference images, and numeric results. Differences include intentional margin, badge height, texture, and date changes; no pixel regions are excluded. [All six export variants](docs/layout-variants.png) show actual output proportions side by side.

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
# additional touch workflows in Chrome and Safari’s WebKit engine:
npx playwright install webkit
npm run test:mobile
npm run build
# after npm run preview is serving the build:
npm run test:offline
```

Browser tests use installed Google Chrome (`channel: 'chrome'`). They cover actual browser downloads and inspect PNG/JPG/SVG sizes, palette pixels, watermark coverage on all four edges, paper texture, consistent margins in all six layouts and three original palettes, ZIP contents, captions, editing, project backup/restore, spacing controls, local font uploads, multiple selections per date, date browsing without deselection, additive suggestions, per-day bulk selection, seven-day list exports, refresh, pagination, date changes, mobile tabs, 320–430px portrait and phone landscape layouts, keyboard-reduced viewports, editor typing focus, accessible tab navigation, source/label filters, skipped days, field visibility, cancellation, and connection failures. One integration test calls the real UNBC API and therefore requires the site to be reachable.

The production offline check reloads with the network disabled and verifies a real PNG download. The offline shell is generated during build by `scripts/build-offline.mjs`. Production files in `dist/` can be served by any static HTTP server; opening `index.html` directly with `file://` is unsupported because browser modules, local fetches, and service workers need an HTTP origin.

## Source map

- `src/api.ts`: API adapters, pagination, normalization, and text cleaning.
- `src/dates.ts`: date ranges, local dates, time labels, DST, and multi-day overlap.
- `src/render.ts`: original card layout, repeating watermark, textured badges, capacity, reflow, image/ZIP exports, and captions.
- `src/list-layout.ts`: seven-day list style, inline bold/italic wrapping, measured row allocation, and pagination.
- `src/vector-text.ts`: shared vector lettering and wrapping helpers.
- `src/date-font.ts`: private browser-local month font import and persistence.
- `src/storage.ts`: versioned local project persistence and backup validation.
- `src/App.tsx`: event picker, filters, date controls, preview, and editors.
- `src/WorkspaceTabs.tsx`: accessible four-tab navigation and responsive visual viewport handling.
- `src/ExportOptions.tsx`: shared desktop dialog / mobile export controls.
- `src/styles.css`: desktop workspace.
- `src/mobile.css`: phone layouts, touch controls, safe areas, keyboard, and landscape behavior.
