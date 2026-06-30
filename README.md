# SMT Board Dashboard (ELK)

Factory dashboard for SPI/AOI inspection data from Elasticsearch.

Plain **HTML + CSS + JavaScript** — no build step.

## Quick start

```bat
start.bat
```

Opens http://127.0.0.1:8000/ and connects to Elasticsearch via `proxy.py`. Requires factory VPN. Credentials are in `proxy.py` (or `ES_USERNAME` / `ES_PASSWORD` env vars).

## Configuration

| File | What it controls |
|------|------------------|
| `config.js` | Which cluster (`environment`) and optional overrides |
| `config/environments.js` | ELK URLs and index patterns |
| `config/schema.*.js` | SPI/AOI field mappings and table columns |
| `config/settings.js` | Refresh interval, page size, time ranges |
| `proxy.py` | ES credentials and proxy port |

Edit `config.js` to switch clusters:

```js
window.DASHBOARD_USER_CONFIG = {
  environment: "factory-sac",
};
```

Add clusters in `config/environments.js`, then reference them by key in `config.js`.

## Project structure

```
config.js           ← environment + overrides
config/
  environments.js
  schema.spi.js
  schema.aoi.js
  settings.js
  bootstrap.js
js/
  app.js
  es-client.js
  es-queries.js
  ui.js
  config-access.js
proxy.py
start.bat
```

## License

Internal factory use.
