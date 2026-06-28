# SMT Board Dashboard (ELK)

Factory dashboard for SMT board inspection results. Built with **plain HTML, CSS, and JavaScript** — no Node.js, no build step.

Works in **demo mode** offline with sample data, or connects to **Elasticsearch** for live production data.

## Quick start

1. Clone the repo:

```bat
git clone https://github.com/yang-githubb/elk-dashbaord.git
cd elk-dashbaord
```

2. Create your config (first time only):

```bat
copy config.example.js config.js
```

3. Edit `config.js` if using live Elasticsearch (see [Configuration](#configuration)).

4. **Double-click `start.bat`** to open the dashboard in your browser.

## Features

### KPIs
- Board count
- Pass / Fail / Good counts
- Yield %

### Filters
| Filter | Options |
|--------|---------|
| **Time** | All time, 15 min, 1 h, 6 h, 24 h, 7 days, 30 days |
| **Line** | Production line |
| **Model** | Board / PCB model |

### Pie charts (selected time range)
- **General pass / fail** — overall Pass vs Fail
- **Model pass / fail / good** — Good / Pass / Fail mix
- **Serial pass / fail / good** — result distribution by board serial
- **By line pass / fail** — Pass vs Fail per line

### Board records table
Paginated list with date, serial, model, line, pass/fail result, and pad count.

## Project structure

| File | Purpose |
|------|---------|
| `start.bat` | Entry point — launches the dashboard |
| `index.html` | Page layout |
| `styles.css` | Factory-floor styling |
| `app.js` | Filters, board aggregation, charts, table |
| `demo-data.js` | Builds demo dataset (synthetic + CSV) |
| `demo-csv-data.js` | 100 pad records from sample inspection CSV |
| `config.example.js` | Config template |
| `config.js` | Your ES credentials (**not in git**) |
| `508BFD5_*.csv` | Source Koh Young inspection CSV (demo) |

## Configuration

Copy `config.example.js` to `config.js`:

```js
window.ES_CONFIG = {
  useDemo: true,                              // false for live Elasticsearch
  node: "https://your-elasticsearch-host",
  username: "your-service-user",
  password: "your-password",
  index: "your-index-name",
  fields: {
    time: "@timestamp",
    line: "line",
    station: "station",
  },
};
```

| Setting | Description |
|---------|-------------|
| `useDemo` | `true` = use local demo data; `false` = query Elasticsearch |
| `node` | Elasticsearch cluster URL |
| `username` / `password` | Service account (read-only recommended) |
| `index` | Index name |
| `fields` | Field names for timestamp, line, and station |

### Demo mode (default)

- **101 boards** total: 100 synthetic + 1 rolled up from CSV pad data
- No VPN or network required
- Status badge shows **Demo**

Set `useDemo: false` when on the factory network with Elasticsearch access.

## Live Elasticsearch

### Requirements
- VPN / network access to the cluster
- CORS enabled on Elasticsearch (browser calls ES directly)

```yaml
http.cors.enabled: true
http.cors.allow-origin: "*"
http.cors.allow-headers: "Authorization, Content-Type"
http.cors.allow-credentials: true
```

### Security
- Credentials are in `config.js` and visible in browser DevTools
- Use a **read-only** service account
- Deploy only on trusted factory PCs or behind an internal web server
- `config.js` is gitignored — never commit credentials

## Deployment

**Factory PC:** double-click `start.bat`

**Internal web server:** copy the folder to IIS, nginx, or any static file host and open `index.html`.

No `npm install` or compilation required.

## Troubleshooting

| Problem | Likely fix |
|---------|------------|
| Blank charts / Disconnected | Turn on demo mode, or check VPN + `config.js` |
| CORS error in browser console (F12) | Enable CORS on Elasticsearch |
| Empty Line / Model dropdowns | Update `fields` in `config.js` to match index mapping |
| `config.js` missing | Run `start.bat` or `copy config.example.js config.js` |

## Handling large datasets (500M+ records)

**Demo mode** only loads ~200 local sample records — for development only.

**Live Elasticsearch mode** is built for large scale:

| What | How | Scales? |
|------|-----|--------|
| KPIs & pie charts | Elasticsearch **aggregations** (`size: 0`) — counts computed on cluster | Yes |
| Board count | `cardinality` on serial field | Yes (approximate on huge sets) |
| Records table | **25 rows per page** only — never loads full dataset | Yes |
| Browser | Never receives 500M documents | — |

### What will NOT work at 500M+
- Loading all records into the browser
- Client-side rollups (demo mode logic)
- **All time** queries without filters on huge indices (slow/timeouts)
- Deep table pagination (page 1,000,000) with `from` + `size`

### Recommendations for production
1. Set `useDemo: false` and map `fields` in `config.js` to your index
2. Use **time filters** (24h / 7d) for routine monitoring; avoid **All time** unless indexed/summarized
3. Ensure `serial`, `line`, `model`, `general`, `result` are **keyword** fields (or `.keyword` subfields)
4. Prefer **board-level** documents in ES, or a rollup index — pad-level 500M docs will aggregate pad counts, not boards
5. Use Elasticsearch **index lifecycle** (daily/weekly indices) for time pruning
6. For very large exports, use ES `_search` / Datafeed / ETL — not this dashboard

### Field mapping (`config.js`)

```js
fields: {
  time: "@timestamp",
  line: "line",
  model: "model",
  serial: "board_id",    // used for cardinality (board count)
  general: "general",    // PASS / FAIL
  result: "result",      // GOOD / PASS / FAIL
}
```

## License

Internal factory use. Adjust as needed for your organization.
