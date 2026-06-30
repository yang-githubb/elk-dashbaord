# SMT Board Dashboard (ELK)

Factory dashboard for SPI pad-level inspection data from Elasticsearch.

Plain **HTML + CSS + JavaScript** — no build step. Modular config for mock vs live data and multiple ELK clusters.

## Quick start

```bat
copy config.example.js config.js
start.bat
```

## Switch mock vs live

Edit **only** `config.js`:

```js
window.DASHBOARD_USER_CONFIG = {
  profile: "mock",           // "mock" | "live"  → see config/profiles.js
  environment: "factory-sac", // used when profile is "live" → config/environments.js
};
```

| profile | Data source |
|---------|-------------|
| `mock` | Local sample data (`mock-es.js`) — no VPN |
| `live` | Elasticsearch via `proxy.py` |

## Project structure

```
config/
  profiles.js       ← mock vs live profiles
  environments.js   ← ELK cluster URLs + index patterns
  schema.spi.js     ← field mappings, table columns, KPI rules
  settings.js       ← refresh interval, page size, time ranges
  bootstrap.js      ← merges everything into Dashboard.config
config.js           ← YOUR picks (gitignored)
js/
  config-access.js  ← config getters
  es-queries.js     ← Elasticsearch query builders
  es-client.js      ← HTTP client / proxy
  ui.js             ← charts, tables, DOM
  app.js            ← main app logic
mock-es.js          ← offline demo data engine
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
  profile: "live",
  environment: "factory-sac",
  overrides: {
    defaultTimeRange: "24h",
    pageSize: 50,
  },
};
```

## Live Elasticsearch

1. `profile: "live"` in `config.js`
2. Run `start.bat` (credentials in `proxy.py`)

## License

Internal factory use.
