# SMT Board Dashboard (ELK)

Factory dashboards for **SPI** solder-paste inspection and **MagicRay** FQI autotest. Data comes from Elasticsearch. The UI is plain HTML, CSS, and JavaScript — no build step, no npm.

The repo root is the web root. `proxy.py` serves HTML/JS/CSS from this folder and forwards search requests to Elasticsearch so the browser never talks to the cluster directly.

---

## Quick start

1. Connect to the factory VPN. Elasticsearch is not reachable without it.
2. From this repo folder:

```bat
start.bat
```

That starts `proxy.py` and opens http://127.0.0.1:8000/ (the hub page).

Or run the proxy yourself:

```bat
python proxy.py
```

Then open http://127.0.0.1:8000/

### After every git pull

**Stop the old `python proxy.py` process and start a new one.** An already-running proxy keeps serving the old JS, HTML, and `/search` routes. Pulling files onto disk is not enough.

On Windows: close the minimized “ELK Dashboard” window, or end the Python process in Task Manager, then run `start.bat` again. Hard-refresh the browser (`Ctrl+F5`) so it does not reuse cached JS.

---

## What you see in the browser

| URL | Page |
|-----|------|
| `/` | Hub — pick SPI or MagicRay |
| `/dashboards/spi/index.html` | SPI dashboard |
| `/dashboards/spi/analysis.html` | SPI board analysis (line / model) |
| `/dashboards/spi/analysis.html?view=pad` | SPI pad analysis (line / model) |
| `/dashboards/spi/pad-analysis.html?failure=EXCESSIVE_VOLUME` | One pad-fail type by line and model |
| `/dashboards/magicray/index.html` | MagicRay dashboard |

Short aliases `/spi` and `/magicray` **302-redirect** to the HTML paths above. Do not bookmark the extensionless URLs: Windows can download them as a file instead of rendering HTML.

Old bookmarks still work via small redirect files:

- `/analysis.html` → SPI board analysis
- `/pad-analysis.html` → SPI pad-failure analysis
- `/magicray.html` → MagicRay dashboard

---

## Project layout

```
elk-dashboard/
  proxy.py                         Static server + ES proxy (the only backend)
  start.bat                        Starts proxy.py and opens the hub
  README.md                        This file
  ADDING-A-DASHBOARD.md            Checklist for a new data source
  index.html                       Hub — pick SPI or MagicRay
  analysis.html / pad-analysis.html / magicray.html
                                   Redirects for old bookmarks
  shared/                          Code used by every dashboard
    styles.css
    config/
      environments.js              Cluster URL + proxy path
      user.js                      Which environment to use
      settings.js                  Time ranges, page size, timeouts
      bootstrap.js                 Merges the above into Dashboard.config
    js/
      registry.js                  Hub cards + top-nav entries
      shell.js                     Top navigation
      config-access.js             Helpers to read schema/config
      es-queries.js                Elasticsearch query / aggregation builders
      es-client.js                 POST /search and POST /search-board
      ui.js                        KPI cards, tables, Pareto chart
      app.js                       Dashboard controller (load, filter, export)
  dashboards/
    spi/                           SPI solder-paste inspection
      index.html
      schema.js                    SPI field map + KPI rules
      analysis.html
      pad-analysis.html
      js/analysis.js
      js/pad-analysis.js
    magicray/                      MagicRay FQI autotest
      index.html
      schema.js                    Assumed field map (not confirmed from mapping)
```

`proxy.py` serves the repo root. A request for `/dashboards/spi/index.html` is the file `dashboards/spi/index.html`.

---

## How SPI data is stored

SPI uses **two Elasticsearch indices**. They are not interchangeable.

| Role | Index (default in `proxy.py`) | Browser route |
|------|-------------------------------|---------------|
| Board / inspection header | `flexh1smtmachinesdata00589-spi-board` | `POST /search-board` |
| Pad / detail rows | `flexh1smtmachinesdata00589-jax_process_optimizations*` | `POST /search` |

One spi-board document is **one board inspection**. The same `array_barcode` can appear many times (retest). KPI totals count **documents**, not unique barcodes.

One jax document is **one pad** on one inspection.

### How a board joins to its pads

| spi-board field | jax field | Meaning |
|-----------------|-----------|---------|
| `array_barcode` | `spi_array_barcode` | Board serial |
| `source_file` | `source_file` | Same inspection file |
| `pcb_name` | `spi_pcb_name` | Model / PCB name |
| `inspection_date` | `spi_inspection_date` | Inspection time |
| `pcb_result` | `spi_pcb_result` | Board-level result (copied onto pads) |
| — | `spi_pad_result` | **Pad-level** result (this is what pad KPIs use) |

A board can be `pcb_result: PASS` while some pads are `spi_pad_result: EXCESSIVE_VOLUME`. Pad overview always uses jax. Board overview always uses spi-board.

### Field types (this matters for queries)

- **spi-board** fields used here are **native keyword**. Query them as `line`, `pcb_name`, `array_barcode`. Do **not** append `.keyword`.
- **jax** text fields need `.keyword` for exact terms aggregations: `spi_pad_result.keyword`, `spi_array_barcode.keyword`, `spi_pcb_name.keyword`, `line.keyword`.

`dashboards/spi/schema.js` encodes that. Shared helpers:

- `D.esBoardField("line")` → `line`
- `D.esField("line")` → `line.keyword`

---

## SPI pages, in detail

### 1. Dashboard (`dashboards/spi/index.html`)

Filters: time range, line, model. Default time range is **All time** (`settings.js` → `defaultTimeRange: "all"`). All time sends **no date filter**, so Elasticsearch scans the whole index.

**Board Overview** (spi-board)

- Counts every matching board document.
- `pcb_result`: `GOOD` stays good; `PASS` and `WARNING` count as good on the pie; `NG` is fail.
- Click the card → board analysis.

**Pad Overview** (jax)

- Counts every matching pad document.
- Good = `spi_pad_result` in `GOOD`.
- Fail = the named defect types in `schema.js` (`EXCESSIVE_VOLUME`, `BRIDGING`, …).
- Click the card → pad analysis (`analysis.html?view=pad`).

**Pad Failure Pareto**

- One bar per fail type from the same pad aggregation.
- Click a bar → `pad-analysis.html?failure=<TYPE>`.

**Board serial table** (spi-board)

- Groups rows by `array_barcode` so you can open pad details for a serial.
- This grouping is only for navigation. It does **not** change the overview KPI totals.
- Click a serial → pad table for that barcode (jax).

**Load order (why the board card appears first)**

1. Line/model dropdowns load from **spi-board** (small index).
2. Board KPIs and the board list load from **spi-board** and render immediately.
3. Pad KPIs and Pareto load from **jax** in the background. The pad card shows “Loading pad KPIs…” until that finishes.
4. If jax is slow or errors, the board UI stays up.

Auto-refresh (every 120 seconds) **does not abort** an in-flight All-time pad query. Manual Refresh still starts a new load.

### 2. Board analysis (`analysis.html`)

From Board Overview. One table by **line**, one by **model**.

Columns: Boards, Good, Pass, Fail, Yield %.

- **Boards** = number of spi-board **documents** in that line/model (retests count again).
- Good / Pass / Fail = `pcb_result` on those documents (`WARNING` maps to Pass).
- Yield = Good / (Good + Pass + Fail).
- All models are requested (up to 10,000 distinct `pcb_name` values).

### 3. Pad analysis (`analysis.html?view=pad`)

From Pad Overview. Same layout, pad metrics only. No board counts mixed in.

Columns: Good, Fail, Pads, Yield %.

- **Pads** = jax **documents** in that line/model.
- Good / Fail from `spi_pad_result`.
- Yield = Good / Pads.

Under each line/model the query uses two filters (good and fail), not one terms aggregation per defect type. That keeps Elasticsearch under its bucket limit when there are many models. See “Why pad analysis does not explode buckets” below.

### 4. Pad-failure analysis (`pad-analysis.html`)

From a Pareto bar. Query is jax filtered to one `spi_pad_result` value. Tables: count by line, and a model × line matrix.

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

## Why some queries are slower than others

| Query | Index | Typical speed |
|-------|--------|----------------|
| Line/model dropdowns | spi-board | Fast |
| Board overview + board list | spi-board | Fast |
| Board analysis | spi-board, All time | Moderate (full index, cheap aggs) |
| Pad overview + Pareto | jax, All time | Slow — jax is huge |
| Pad analysis | jax, All time, per line and model | Slowest |

There is no client timeout (`fetchTimeoutMs: 0`) and the proxy waits indefinitely (`ES_TIMEOUT_SEC=0`) so All-time pad aggregations can finish.

Do **not** put `request_cache` in the Elasticsearch JSON body. It is only a URL parameter. Putting it in the body returns **HTTP 400**. Size-0 aggregation searches are cached by Elasticsearch anyway.

### Why pad analysis does not explode buckets

Elasticsearch refuses a search that creates more than about **65,536** aggregation buckets.

A naive query “every model × every pad-result type” is:

`models × ~12 pad-result types`

With thousands of PCB names that exceeds the cap and the page fails.

Pad analysis therefore asks, per model/line, only:

- count of good pads
- count of fail pads
- parent `doc_count` = all pads

That is two child buckets per model, not twelve.

---

## The proxy (`proxy.py`)

`proxy.py` is a stdlib HTTP server. No pip packages.

| Method | Path | What it does |
|--------|------|----------------|
| GET | `/` and any `.html` / `.js` / `.css` under the repo root | Static files |
| POST | `/search` | Forwards the JSON body to the **jax** index `_search` |
| POST | `/search-board` | Forwards the JSON body to the **spi-board** index `_search` |
| OPTIONS | `/search` | CORS / health probe |

Defaults (override with environment variables):

| Variable | Default role |
|----------|----------------|
| `PORT` | `8000` |
| `ES_URL` | Factory SAC Elasticsearch URL |
| `DETAIL_INDEX` | jax wildcard |
| `BOARD_INDEX` | spi-board |
| `ES_USERNAME` / `ES_PASSWORD` | Service user (prefer env vars in production) |
| `ES_TIMEOUT_SEC` | `0` = wait until ES responds |

The browser never sends Elasticsearch credentials. `es-client.js` posts to `/search` or `/search-board` on the same origin. `environments.js` sets `proxyUrl: "/search"` for that.

---

## Configuration files

Startup order on an SPI page (see `dashboards/spi/index.html`):

1. `environments.js` — cluster
2. `user.js` — which environment
3. `schema.js` — SPI fields and KPI lists
4. `settings.js` — time ranges, page size
5. Inline `DASHBOARD_PAGE` + `schema: "SPI"`
6. `bootstrap.js` — builds `Dashboard.config`
7. Shared JS (`registry`, `shell`, queries, client, UI, app)

| File | Purpose |
|------|---------|
| `shared/config/user.js` | `environment: "factory-sac"`. Optional `overrides.defaultTimeRange` / `pageSize`. |
| `shared/config/environments.js` | `node`, `proxyUrl`. Keep `node` in sync with `ES_URL` in `proxy.py`. |
| `shared/config/settings.js` | `defaultTimeRange`, `timeLabels`, `pageSize` (25), `refreshMs` (120s), `fetchTimeoutMs` (`0` = no abort). |
| `dashboards/spi/schema.js` | SPI field names, good/fail values, column lists, `indexMode: "dual"`. |
| `dashboards/magicray/schema.js` | MagicRay field names, `indexMode: "single"`. Mapping was never confirmed from a real index dump. |
| `proxy.py` | Port, ES URL, both index names, credentials, timeout. |

To default the time dropdown back to 14 days, set `defaultTimeRange: "14d"` in `settings.js` (or `user.js` overrides). `"all"` must stay in `timeOrder` to keep the All time option.

---

## Shared JavaScript (what each file does)

| File | Role |
|------|------|
| `registry.js` | Hub cards and the Home / SPI / MagicRay tabs |
| `shell.js` | Renders those tabs; sets the page title from the schema |
| `config-access.js` | `getFields()`, `esField()`, `esBoardField()`, `normalizeResult()`, `countNormalizedResults()` |
| `es-queries.js` | Filters and aggregations. `isAllTime()` skips the date range. `lite: true` skips empty-serial / underscore-file filters on KPI queries. |
| `es-client.js` | `search()` → `/search` (jax). `searchBoard()` → `/search-board`. Surfaces Elasticsearch error reasons on HTTP failures. |
| `ui.js` | Overview cards, tables, Pareto SVG, number formatting (`1,000,000`) |
| `app.js` | Filter changes, progressive KPI load, board/pad paging, Excel export |

MagicRay uses the same `app.js` with `indexMode: "single"`, so both KPI cards hit `/search` only.

---

## MagicRay status

The MagicRay folder is isolated so SPI changes do not overwrite it. Its schema is **assumed** (`inspectiondate`, `confirmedresult`, station `FQI_AUTOTEST`). Until a real mapping and sample documents are provided, KPI numbers may be wrong. It still uses the jax `/search` proxy unless `proxy.py` is pointed at a MagicRay index.

---

## Adding a new dashboard (AOI, etc.)

Short checklist: [ADDING-A-DASHBOARD.md](ADDING-A-DASHBOARD.md).

Idea: one folder per data source, shared core stays generic.

1. Add `dashboards/<id>/index.html` and `schema.js`.
2. Register the card in `shared/js/registry.js` (`path` must be `/dashboards/<id>/index.html`).
3. Set `indexMode` to `"dual"` if you have a header index plus a detail index, or `"single"` if one index holds everything.
4. Map `fields` / `boardFields` and `kpi.good` / `kpi.fail` from a real Elasticsearch mapping, not from names that “look right”.
5. If you need a second index, add another POST route in `proxy.py` (the way `/search-board` was added for SPI).

No proxy change is required for new **static** files under `dashboards/`.

---

## Numbers and counting rules (SPI)

- Overview and analysis **count documents**. Repeated `array_barcode` / `spi_array_barcode` values each count.
- The board **table** still groups by serial so you can open pads for that board.
- Counts in the UI use thousands separators (`1,000,000`). Yield is a percentage with two decimals.
- Analysis model lists request up to 10,000 distinct models so normal SMT model lists are not truncated.

---

## Troubleshooting

| Symptom | Likely cause | What to do |
|---------|--------------|------------|
| Page looks like the old version | Old `proxy.py` still running | Kill it, start again, `Ctrl+F5` |
| `404` on `/dashboards/spi/index.html` | Proxy started from the wrong folder, or old proxy | Run `python proxy.py` from the repo root |
| Browser **downloads** a file named `spi` | Hit `/spi` without redirect / MIME | Use `/dashboards/spi/index.html` or pull a version that 302s `/spi` |
| `HTTP 400` | Invalid search body (for example `request_cache` inside JSON) | Check the error text on the red banner; that key must not be in the body |
| `502` / cannot reach Elasticsearch | No VPN, or `ES_URL` wrong | Connect VPN; check `proxy.py` |
| Board KPIs show, pad KPIs stay on “Loading…” | jax All-time aggregation still running | Wait; there is no timeout. Board data is already correct. |
| Pad analysis errors after adding many models | Too many aggregation buckets | Keep good/fail as two filters per model (current code) |
| Line/model dropdown empty | Query hit jax with `.keyword` on a keyword-only board field, or wrong station filter | Dropdowns must use `/search-board` and `esBoardField()` |

---

## License

Internal factory use.
