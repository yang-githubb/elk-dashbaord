# SMT Board Dashboard (ELK)

Factory dashboard for SPI/AOI inspection data from Elasticsearch.

Plain **HTML + CSS + JavaScript** — no build step. Modular config for ELK clusters and station schemas.

## Quick start

```bat
copy config.example.js config.js
start.bat
```

Opens http://127.0.0.1:8000/ and connects to Elasticsearch via `proxy.py` (credentials in `proxy.py` or `ES_USERNAME` / `ES_PASSWORD` env vars). Requires factory VPN when using the default cluster.

## Configuration

Edit **only** `config.js`:

```js
window.DASHBOARD_USER_CONFIG = {
  environment: "factory-sac",  // → config/environments.js
};
```

## Project structure

```
config/
  environments.js   ← ELK cluster URLs + index patterns
  schema.spi.js     ← SPI field mappings, table columns, KPI rules
  schema.aoi.js     ← AOI field mappings (board list only)
  settings.js       ← refresh interval, page size, time ranges
  bootstrap.js      ← merges everything into Dashboard.config
config.js           ← YOUR picks (gitignored)
js/
  config-access.js  ← config getters
  es-queries.js     ← Elasticsearch query builders
  es-client.js      ← HTTP client / proxy
  ui.js             ← charts, tables, DOM
  app.js            ← main app logic
proxy.py            ← static server + ELK proxy
```

## Add another ELK cluster

In `config/environments.js`:

```js
"my-cluster": {
  label: "My Cluster",
  node: "https://...",
  index: "my-index-*",
  proxyUrl: "/search",
},
```

Then set `environment: "my-cluster"` in `config.js`.

## Optional overrides (config.js)

```js
window.DASHBOARD_USER_CONFIG = {
  environment: "factory-sac",
  overrides: {
    defaultTimeRange: "24h",
    pageSize: 50,
  },
};
```

## License

Internal factory use.
