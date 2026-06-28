# SMT Machines ELK Dashboard

Pure static dashboard — **HTML, CSS, JavaScript only**. No Node, no build step.

Calls Elasticsearch directly from the browser.

## Run

**Double-click `start.bat`** in this folder.

Demo mode is on by default (`useDemo: true` in `config.js`) with **200 sample records** — 100 synthetic + 100 from the Koh Young CSV pad inspection file.

Set `useDemo: false` in `config.js` when ready for live data.

## Files

| File | Purpose |
|------|---------|
| `start.bat` | **Entry point** — double-click to launch |
| `index.html` | Page layout |
| `styles.css` | Styling |
| `app.js` | Queries, charts, filters, table |
| `demo-csv-data.js` | 100 pad records parsed from the inspection CSV |
| `demo-data.js` | Merges synthetic + CSV into `DEMO_RECORDS` |
| `config.js` | ES credentials + `useDemo` flag (not committed) |

## Charts (demo mode)

- **KPI cards** — total, OK / warn / error counts, avg cycle time
- **Events over time** — bar timeline
- **By line** / **By station** — horizontal bar charts
- **Status mix** — pie chart (OK / WARN / ERROR)

## Setup (first time only)

1. Run `start.bat` (it will create `config.js` if needed), **or** manually:

```bat
copy config.example.js config.js
```

2. Edit `config.js` with your Elasticsearch details.

3. Run `start.bat` again.

Alternatively, open `index.html` directly or host the folder on IIS / nginx.

## CORS requirement

The browser blocks cross-origin requests unless Elasticsearch allows them. Your cluster admin may need to add:

```yaml
http.cors.enabled: true
http.cors.allow-origin: "*"   # or your dashboard host
http.cors.allow-headers: "Authorization, Content-Type"
http.cors.allow-credentials: true
```

If you see a CORS or network error, this is the most likely cause.

## Security note

Credentials live in `config.js` and are visible in the browser. Use a read-only service account and restrict access to factory machines only.

## Field names

If Line/Station dropdowns are empty, update `fields` in `config.js` to match your index mapping.
