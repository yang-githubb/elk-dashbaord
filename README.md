# SMT Board Dashboard (ELK)

Factory dashboards for **SPI** solder-paste inspection and **MagicRay** FQI autotest. Data comes from Elasticsearch.

The UI is plain HTML, CSS, and JavaScript. There is no build step and no npm. `proxy.py` is the only backend: it serves the files in `web/` and forwards search requests to Elasticsearch so the browser never talks to the cluster.

---

## Contents

1. [Quick start](#quick-start)
2. [Pages and URLs](#pages-and-urls)
3. [Project layout](#project-layout)
4. [How SPI data is stored](#how-spi-data-is-stored)
5. [What each SPI page does](#what-each-spi-page-does)
6. [How KPIs are counted](#how-kpis-are-counted)
7. [Pad-result types](#pad-result-types)
8. [Why pad queries are slower](#why-pad-queries-are-slower)
9. [The proxy](#the-proxy)
10. [Configuration](#configuration)
11. [Shared JavaScript](#shared-javascript)
12. [MagicRay](#magicray)
13. [Adding a dashboard](#adding-a-dashboard)
14. [Troubleshooting](#troubleshooting)

---

## Quick start

1. Connect to the factory VPN. Elasticsearch is not reachable without it.
2. From this repo folder:

```bat
start.bat
```

That starts `proxy.py` and opens http://127.0.0.1:8000/ (the hub).

Or run the proxy yourself:

```bat
python proxy.py
```

Then open http://127.0.0.1:8000/

The startup log must say it is serving `...\web` and `Index exists: True`. If it still prints an `SPI` folder, you are running an old process.

### After every git pull

**Stop the old `python proxy.py` process and start a new one.** An already-running proxy keeps serving old HTML, JS, and `/search` routes. Pulling files onto disk is not enough.

On Windows: close the minimized “ELK Dashboard” window, or end Python in Task Manager, then run `start.bat` again. Hard-refresh the browser with `Ctrl+F5`.

---

## Pages and URLs

`proxy.py` serves `web/` as `/`. Browser paths do **not** include the word `web`.

| URL | Page |
|-----|------|
| `/` | Hub — pick SPI or MagicRay |
| `/dashboards/spi/index.html` | SPI dashboard |
| `/dashboards/spi/analysis.html` | SPI board analysis (by line and model) |
| `/dashboards/spi/analysis.html?view=pad` | SPI pad analysis (by line and model) |
| `/dashboards/spi/pad-analysis.html?failure=EXCESSIVE_VOLUME` | One pad-fail type by line and model |
| `/dashboards/magicray/index.html` | MagicRay dashboard |

Short aliases **302-redirect** to the HTML files above:

| Alias | Goes to |
|-------|---------|
| `/spi` | `/dashboards/spi/index.html` |
| `/magicray` | `/dashboards/magicray/index.html` |
| `/magicray.html` | `/dashboards/magicray/index.html` |
| `/analysis.html` | `/dashboards/spi/analysis.html` |
| `/pad-analysis.html` | `/dashboards/spi/pad-analysis.html` |

Prefer the `.html` paths. Bookmarking `/spi` used to download a file on Windows because the server had no file extension to pick a MIME type. The 302 exists so old bookmarks still open in the browser.

---

## Project layout

```
elk-dashboard/
  README.md                      This file
  ADDING-A-DASHBOARD.md          Short checklist for a new data source
  proxy.py                       Static server + Elasticsearch proxy
  start.bat                      Starts proxy.py and opens the hub
  web/                           Everything the browser is served
    index.html                   Hub
    shared/                      Core used by every dashboard
      styles.css
      config/                    Cluster, time ranges, bootstrap
      js/                        Queries, UI, dashboard controller
    dashboards/
      spi/                       SPI only (schema + pages)
      magicray/                  MagicRay only (schema + page)
```

| Disk path | Browser URL |
|-----------|-------------|
| `web/index.html` | `/` |
| `web/dashboards/spi/index.html` | `/dashboards/spi/index.html` |
| `web/shared/js/app.js` | `/shared/js/app.js` |

Root of the repo is docs and the server. `web/` is the product UI. `web/dashboards/spi/` is one data source, not the whole app.

---

## How SPI data is stored

SPI uses **two Elasticsearch indices**. They are not interchangeable.

| Role | Default index in `proxy.py` | Browser route |
|------|-----------------------------|----------------|
| Board / inspection header | `flexh1smtmachinesdata00589-spi-board` | `POST /search-board` |
| Pad / detail rows | `flexh1smtmachinesdata00589-jax_process_optimizations*` | `POST /search` |

- One **spi-board** document = one board inspection. The same `array_barcode` can appear many times (retest).
- One **jax** document = one pad on one inspection.

### How a board joins to its pads

| spi-board | jax | Meaning |
|-----------|-----|---------|
| `array_barcode` | `spi_array_barcode` | Board serial |
| `source_file` | `source_file` | Same inspection file |
| `pcb_name` | `spi_pcb_name` | Model / PCB name |
| `inspection_date` | `spi_inspection_date` | Inspection time |
| `pcb_result` | `spi_pcb_result` | Board-level result (copied onto pads) |
| — | `spi_pad_result` | **Pad-level** result (pad KPIs use this) |

A board can be `pcb_result: PASS` while some pads are `spi_pad_result: EXCESSIVE_VOLUME`.

- Board Overview and board analysis → **spi-board only**
- Pad Overview, Pareto, pad analysis, pad table → **jax only**

### Field types (this matters for queries)

- **spi-board** fields used here are **native keyword**. Query `line`, `pcb_name`, `array_barcode` as-is. Do **not** append `.keyword`.
- **jax** text fields need `.keyword` for exact terms: `spi_pad_result.keyword`, `spi_array_barcode.keyword`, `spi_pcb_name.keyword`, `line.keyword`.

`web/dashboards/spi/schema.js` encodes that. Helpers:

- `D.esBoardField("line")` → `line` (board index)
- `D.esField("line")` → `line.keyword` (jax index)

---

## What each SPI page does

Filters on every SPI page: **time**, **line**, **model**. Default time range is **All time** (`web/shared/config/settings.js` → `defaultTimeRange: "all"`). All time sends **no date filter**, so Elasticsearch scans the whole index.

### Dashboard — `web/dashboards/spi/index.html`

**Board Overview** (spi-board)

- Counts every matching board document.
- On the pie, `PASS` and `WARNING` are treated as good; `NG` is fail.
- Click the card → board analysis.

**Pad Overview** (jax)

- Counts every matching pad document.
- Good = `spi_pad_result` `GOOD`. Fail = the defect list in `schema.js`.
- Click the card → pad analysis (`?view=pad`).

**Pad Failure Pareto** (jax)

- One bar per fail type, from the same pad aggregation as Pad Overview.
- Click a bar → pad-failure analysis for that type.

**Board serial table** (spi-board)

- Groups by `array_barcode` so you can open pads for a serial.
- Grouping is **navigation only**. It does not change overview KPI totals.
- Click a serial → jax pad rows for that barcode.

**Load order** (why the board card appears first)

1. Line and model dropdowns load from spi-board (small index).
2. Board KPIs and the board list load from spi-board and render immediately.
3. Pad KPIs and Pareto load from jax in the background. The pad card shows “Loading pad KPIs…” until that finishes.
4. If jax is slow or errors, the board UI stays up.

Auto-refresh (every 120 seconds) does **not** abort an in-flight All-time pad query. The Refresh button still starts a new load.

### Board analysis — `analysis.html`

Opened from Board Overview. Two tables: by line and by model.

| Column | Meaning |
|--------|---------|
| Boards | spi-board **documents** in that line/model (retests count again) |
| Good / Pass / Fail | `pcb_result` (`WARNING` maps to Pass) |
| Yield % | Good / (Good + Pass + Fail) |

All models are requested (up to 10,000 distinct `pcb_name` values).

### Pad analysis — `analysis.html?view=pad`

Opened from Pad Overview. Pad metrics only. No board counts mixed in.

| Column | Meaning |
|--------|---------|
| Good / Fail | From `spi_pad_result` |
| Pads | jax **documents** in that line/model |
| Yield % | Good / Pads |

Per line/model the query uses two filters (good and fail), not one bucket per defect type. That stays under Elasticsearch’s aggregation bucket limit. See [Why pad queries are slower](#why-pad-queries-are-slower).

### Pad-failure analysis — `pad-analysis.html`

Opened from a Pareto bar. Jax, filtered to one `spi_pad_result` value. Tables: count by line, and a model × line matrix.

---

## How KPIs are counted

- Overview and analysis **count documents**. If the same `array_barcode` is inspected three times, that is three board documents.
- The board **table** still groups by serial so you can open pad details.
- Counts in the UI use thousands separators (`1,000,000`). Yield is a percentage with two decimals.

Dashboard board pie: Good = `GOOD` + `PASS` + `WARNING`, Fail = `NG`.

---

## Pad-result types

`spi_pad_result` is the SPI verdict for **one pad**, not the whole board.

| Class | Values |
|-------|--------|
| Good | `GOOD` |
| Fail | `EXCESSIVE_VOLUME`, `INSUFFICIENT_VOLUME`, `POSITION`, `BRIDGING`, `SMEAR`, `HIGH_AREA`, `LOW_AREA`, `SHAPE`, `UPPER_HEIGHT`, `LOW_HEIGHT` |

The overview pie rolls fail types into one Fail slice. The Pareto chart keeps them separate.

Board-level `pcb_result` is different: `GOOD`, `PASS`, `WARNING`, `NG`.

---

## Why pad queries are slower

| Query | Index | Typical speed |
|-------|--------|----------------|
| Line/model dropdowns | spi-board | Fast |
| Board overview + board list | spi-board | Fast |
| Board analysis | spi-board, All time | Moderate |
| Pad overview + Pareto | jax, All time | Slow — jax is huge |
| Pad analysis | jax, All time, per line and model | Slowest |

There is no client timeout (`fetchTimeoutMs: 0`) and the proxy waits indefinitely (`ES_TIMEOUT_SEC=0`) so All-time pad aggregations can finish.

Do **not** put `request_cache` in the Elasticsearch JSON body. That key is only valid as a URL parameter. Putting it in the body returns **HTTP 400**. Size-0 aggregation searches are cached by Elasticsearch anyway.

### Elasticsearch bucket limit

A search that creates more than about **65,536** aggregation buckets is rejected.

A naive query “every model × every pad-result type” is:

`number of models × ~12 pad-result types`

Thousands of PCB names would exceed the cap and the analysis page would fail.

Pad analysis therefore asks, per line/model, only:

- count of good pads
- count of fail pads
- parent `doc_count` = all pads

That is two child buckets per model, not twelve. Every pad document is still counted.

---

## The proxy

`proxy.py` is a Python stdlib HTTP server. No pip packages.

| Method | Path | What it does |
|--------|------|----------------|
| GET | `/` and any `.html` / `.js` / `.css` under `web/` | Static files |
| POST | `/search` | Forwards the JSON body to the **jax** `_search` URL |
| POST | `/search-board` | Forwards the JSON body to the **spi-board** `_search` URL |
| OPTIONS | `/search` | CORS / health probe |

Environment variables (all optional; defaults are in `proxy.py`):

| Variable | Meaning |
|----------|---------|
| `PORT` | Listen port (default `8000`) |
| `ES_URL` | Elasticsearch base URL |
| `DETAIL_INDEX` | jax / pad index pattern (`POST /search`) |
| `BOARD_INDEX` | spi-board index (`POST /search-board`) |
| `ES_USERNAME` / `ES_PASSWORD` | Basic auth (prefer env vars over editing the file) |
| `ES_TIMEOUT_SEC` | Seconds to wait for ES; `0` = wait until it finishes |

The browser never sends Elasticsearch credentials. `es-client.js` posts to `/search` or `/search-board` on the same origin. `web/shared/config/environments.js` sets `proxyUrl: "/search"` for that.

---

## Configuration

Script order on an SPI page (`web/dashboards/spi/index.html`):

1. `../../shared/config/environments.js` — cluster URL
2. `../../shared/config/user.js` — which environment
3. `./schema.js` — SPI fields and KPI lists
4. `../../shared/config/settings.js` — time ranges, page size
5. Inline `DASHBOARD_PAGE` + `schema: "SPI"`
6. `../../shared/config/bootstrap.js` — builds `Dashboard.config`
7. Shared JS: `registry`, `shell`, `config-access`, `es-queries`, `es-client`, `ui`, `app`

| File | Purpose |
|------|---------|
| `web/shared/config/user.js` | `environment: "factory-sac"`. Optional `overrides` for time range / page size. |
| `web/shared/config/environments.js` | `node`, `proxyUrl`. Keep `node` in sync with `ES_URL` in `proxy.py`. |
| `web/shared/config/settings.js` | `defaultTimeRange` (`all`), labels, `pageSize` (25), `refreshMs` (120s), `fetchTimeoutMs` (`0` = no abort). |
| `web/dashboards/spi/schema.js` | SPI field names, good/fail values, columns, `indexMode: "dual"`. |
| `web/dashboards/magicray/schema.js` | MagicRay field names, `indexMode: "single"`. Mapping not confirmed from a real dump. |
| `proxy.py` | Port, ES URL, both index names, credentials, timeout. |

To default the time dropdown to 14 days, set `defaultTimeRange: "14d"` in `settings.js` (or in `user.js` overrides). Keep `"all"` in `timeOrder` so All time stays in the list.

---

## Shared JavaScript

All under `web/shared/js/`.

| File | Role |
|------|------|
| `registry.js` | Hub cards and the Home / SPI / MagicRay tabs |
| `shell.js` | Renders those tabs; sets the page title from the schema |
| `config-access.js` | `getFields()`, `esField()`, `esBoardField()`, `normalizeResult()`, `countNormalizedResults()` |
| `es-queries.js` | Filters and aggregations. `isAllTime()` skips the date range. KPI queries use `lite: true` so they skip extra empty-serial filters. |
| `es-client.js` | `search()` → `/search` (jax). `searchBoard()` → `/search-board`. Shows Elasticsearch’s error text on HTTP failures. |
| `ui.js` | Overview cards, tables, Pareto chart, number formatting |
| `app.js` | Filter changes, progressive KPI load, paging, Excel export |

MagicRay uses the same `app.js` with `indexMode: "single"`, so both KPI cards hit `/search` only.

---

## MagicRay

`web/dashboards/magicray/` is isolated so SPI changes do not overwrite it.

Its schema is **assumed** (`inspectiondate`, `confirmedresult`, station `FQI_AUTOTEST`). Until a real mapping and sample documents are provided, KPI numbers may be wrong. It currently uses the same jax `POST /search` proxy unless `DETAIL_INDEX` in `proxy.py` is pointed at a MagicRay index.

---

## Adding a dashboard

Short checklist: [ADDING-A-DASHBOARD.md](ADDING-A-DASHBOARD.md).

1. Add `web/dashboards/<id>/index.html` and `schema.js`.
2. Register the card in `web/shared/js/registry.js`. `path` must be `/dashboards/<id>/index.html`.
3. Set `indexMode` to `"dual"` if you have a header index plus a detail index, or `"single"` if one index holds everything.
4. Map `fields` / `boardFields` and `kpi.good` / `kpi.fail` from a real Elasticsearch mapping.
5. If you need a second index, add another POST route in `proxy.py` (the way `/search-board` was added for SPI).

New static files under `web/dashboards/` need no proxy change.

---

## Troubleshooting

| Symptom | Likely cause | What to do |
|---------|--------------|------------|
| Page looks like the old version | Old `proxy.py` still running | Kill it, start again, `Ctrl+F5` |
| `404` on `/dashboards/spi/index.html` | Old proxy serving `SPI/` or the repo root | Kill it. New startup log must include `...\web` |
| Browser **downloads** a file named `spi` | Hit `/spi` on a proxy that does not 302 | Use `/dashboards/spi/index.html`, or pull this version |
| `HTTP 400` | Invalid search body (for example `request_cache` in JSON) | Read the red banner; that key must not be in the body |
| `502` / cannot reach Elasticsearch | No VPN, or `ES_URL` wrong | Connect VPN; check `proxy.py` |
| Board KPIs show, pad KPIs stay on “Loading…” | jax All-time aggregation still running | Wait; there is no timeout. Board data is already correct |
| Pad analysis errors with many models | Too many aggregation buckets | Keep good/fail as two filters per model (current code) |
| Line/model dropdown empty | Query hit jax with `.keyword` on a board keyword field | Dropdowns must use `/search-board` and `esBoardField()` |

---

## License

Internal factory use.
