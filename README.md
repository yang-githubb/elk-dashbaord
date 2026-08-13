# SMT Board Dashboard (ELK)

Factory dashboards for SPI, MagicRay, and other inspection data from Elasticsearch.

Plain **HTML + CSS + JavaScript** — no build step.

## Quick start

```bat
start.bat
```

Opens http://127.0.0.1:8000/ (dashboard hub) and connects to Elasticsearch via `proxy.py`. Requires factory VPN.

## Project structure

```
SPI/
  index.html              ← hub — pick a dashboard
  shared/                 ← universal core (queries, UI, app logic)
    config/
    js/
    styles.css
  dashboards/
    spi/                  ← SPI solder paste inspection
    magicray/             ← MagicRay FQI autotest
proxy.py                  ← static server + ES proxy
start.bat
```

See [SPI/ADDING-A-DASHBOARD.md](SPI/ADDING-A-DASHBOARD.md) for adding a new data source.

## Configuration

| File | What it controls |
|------|------------------|
| `SPI/shared/config/user.js` | Environment selection and overrides |
| `SPI/shared/config/environments.js` | ELK cluster URLs and index patterns |
| `SPI/dashboards/*/schema.js` | Per-source field mappings and KPI rules |
| `SPI/shared/config/settings.js` | Refresh interval, page size, time ranges |
| `proxy.py` | ES credentials, board/detail index names, port |

## URLs

| Dashboard | Path |
|-----------|------|
| Hub | `/` |
| SPI | `/dashboards/spi/index.html` |
| MagicRay | `/dashboards/magicray/index.html` |

Legacy bookmarks (`magicray.html`, `analysis.html`, etc.) redirect automatically.

## License

Internal factory use.
