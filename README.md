# SMT Board Dashboard (ELK)

Factory dashboard for SPI pad-level inspection data from Elasticsearch.

Plain **HTML + CSS + JavaScript** — no Node.js, no build step. Includes a stdlib Python proxy for factory deployment.

## Quick start

```bat
git clone https://github.com/yang-githubb/elk-dashbaord.git
cd elk-dashbaord
copy config.example.js config.js
start.bat
```

Opens `http://127.0.0.1:8000/` in your browser.

## Modes

| Mode | Config | When to use |
|------|--------|-------------|
| **Mock** | `useMock: true` | Offline dev — 100 sample SPI records, no VPN |
| **Live** | `useMock: false` | Factory PC on VPN — queries Elasticsearch via proxy |

## Features

- **Board KPIs** — distinct `array_barcode` pass/fail (any NG pad = board fail)
- **Pad KPIs** — GOOD / PASS (includes WARNING) / FAIL (NG) counts
- **Pie charts** — board and pad result distribution
- **Filters** — time, line, model (pcb_name)
- **Table** — paginated pad-level rows (25 per page)

## Project structure

| File | Purpose |
|------|---------|
| `start.bat` | Starts `proxy.py` and opens the dashboard |
| `proxy.py` | Serves static files + `POST /search` → Elasticsearch |
| `index.html` | Page layout |
| `styles.css` | Dark factory-floor styling |
| `app.js` | Filters, ES queries, KPIs, charts, table |
| `mock-es.js` | Offline mock Elasticsearch client |
| `config.example.js` | Config template |
| `config.js` | Your settings (**gitignored**) |

## Configuration

```js
window.ES_CONFIG = {
  useMock: true,           // false for live Elasticsearch
  proxyUrl: "/search",     // relative when served by proxy.py
  node: "https://your-es-host",
  index: "your-index-*",
  fields: {
    time: "timestamp",
    line: "line",
    model: "pcb_name",
    serial: "array_barcode",
    station: "station",
  },
};
```

## Live Elasticsearch (factory)

1. Set `useMock: false` in `config.js`
2. Run `start.bat` (credentials are in `proxy.py`, overridable via `ES_USERNAME` / `ES_PASSWORD` env vars)

## Scaling (500M+ records)

All KPIs and charts use Elasticsearch **aggregations** (`size: 0`) — counts are computed on the cluster, not in the browser. The table loads 25 rows per page only.

Recommendations:
- Use time filters (24h / 7d) for routine monitoring
- Ensure `array_barcode`, `pcb_name`, `line`, `pcb_result` have `.keyword` subfields
- Board KPI uses composite aggregation on `array_barcode` (cached 3 min)

## License

Internal factory use.
