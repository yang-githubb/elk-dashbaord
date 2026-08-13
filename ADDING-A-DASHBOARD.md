# Adding a new dashboard

Full architecture, SPI indices, and KPI rules: [README.md](README.md).

Each data source gets its own folder under `dashboards/<id>/`. Do not copy SPI query code into the new folder unless that source really uses the same indices.

## 1. Register the dashboard

Add an entry to `shared/js/registry.js`:

```javascript
{
  id: "aoi",
  schemaKey: "AOI",
  label: "AOI Dashboard",
  description: "Automated optical inspection KPIs.",
  path: "/dashboards/aoi/index.html",
  station: "AOI",
}
```

## 2. Create the folder

```
dashboards/aoi/
  index.html      ← copy from dashboards/spi/index.html and trim features
  schema.js       ← field maps, KPI rules, features, labels, pages
  js/             ← optional page-specific scripts (analysis, export, …)
  analysis.html   ← optional sub-pages
```

## 3. Define the schema (`schema.js`)

Key properties:

| Property | Purpose |
|----------|---------|
| `indexMode` | `"dual"` (board + detail indices) or `"single"` |
| `features` | Toggle board list, analysis pages, pareto drill-down |
| `labels` | UI copy (titles, overview card names) |
| `pages` | Relative paths for sub-pages (`analysis`, `padAnalysis`) |
| `fields` / `boardFields` | Elasticsearch field mapping |
| `kpi` | Result fields and good/pass/fail value lists |

## 4. Wire `index.html`

Load scripts in this order (paths relative to the dashboard folder):

1. `../../shared/config/environments.js`
2. `./schema.js`
3. `../../shared/config/settings.js`
4. Inline `DASHBOARD_PAGE` + `DASHBOARD_USER_CONFIG`
5. `../../shared/config/bootstrap.js`
6. `../../shared/js/registry.js`
7. `../../shared/js/shell.js`
8. Shared core: `config-access`, `es-queries`, `es-client`, `ui`, `app`
9. Optional `./js/*.js` page scripts

## 5. Shared core (do not duplicate)

| Path | Role |
|------|------|
| `shared/js/app.js` | Main dashboard logic |
| `shared/js/es-queries.js` | Query builders |
| `shared/js/es-client.js` | `/search` and `/search-board` client |
| `shared/js/ui.js` | KPI cards, tables, charts |
| `shared/config/bootstrap.js` | Merges env + schema into `Dashboard.config` |

## Project layout

```
index.html                   ← hub (lists all dashboards)
shared/
  styles.css
  config/
  js/
dashboards/
  spi/
  magicray/
  aoi/                       ← your new dashboard
proxy.py                     ← serves the repo root
```

After adding a folder, no proxy changes are needed — anything under `dashboards/` is served automatically.
