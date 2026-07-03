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

Overview
The existing SPI dashboard currently supports:
Board KPI
Plain TextPASSFAILYIELDShow more lines
using:
Plain Textpcb_result = NG => FAILeverything else => PASSShow more lines
Pad KPI
Using:
Plain Textpad_resultShow more lines
to calculate:
Plain TextGOODFAILShow more lines

New Requirement
SPI requires a more accurate board classification.
A board result alone is no longer sufficient.
A board must also consider whether any pad contains a defect.

SPI Board Rules
GOOD
Board is GOOD when:
Plain Textpcb_result = GOODANDall pads = GOODShow more lines
Examples:
Plain TextGOOD + all GOOD pads = GOODShow more lines

PASS
Board is PASS when:
Plain Textpcb_result = PASSORpcb_result = WARNINGANDall pads = GOODShow more lines
Examples:
Plain TextPASS + all GOOD pads = PASSWARNING + all GOOD pads = PASSShow more lines

FAIL
Board is FAIL when:
Plain Textpcb_result = NGShow more lines
OR
Plain Textany pad contains a defectShow more lines
Examples:
Plain TextGOOD + POSITION = FAILPASS + BRIDGING = FAILWARNING + LOW_HEIGHT = FAILNG + all GOOD = FAILShow more lines

SPI Pad Rules
Pad KPI should only show:
Plain TextGOODFAILShow more lines
No PASS category.

GOOD Pad
Plain Textpad_result = GOODShow more lines

FAIL Pad
Plain TextEXCESSIVE_VOLUMEINSUFFICIENT_VOLUMEPOSITIONBRIDGINGSMEARHIGH_AREALOW_AREASHAPEUPPER_HEIGHTLOW_HEIGHTShow more lines
All mapped to:
Plain TextFAILShow more lines

KPI Formula Changes
Old
Plain TextYield =Pass /(Pass + Fail)Show more lines

New
Board Yield
Plain TextYield =Good /(Good + Pass + Fail)Show more lines
Example:
Plain TextGood = 80Pass = 15Fail = 5Yield = 80%Show more lines

Pad Yield
Plain TextYield =Good /(Good + Fail)Show more lines

Files Updated
1. SPI Schema
File:
Plain Textspi-schema.jsShow more lines
Added:
JavaScriptboardGoodboardPassboardFailpadFailResultsShow more lines

2. Elasticsearch Query Builder
File:
Plain Textes-queries.jsShow more lines
Updated:
JavaScriptbuildBoardListAgg()Show more lines
Added:
JavaScripthas_pad_failShow more lines
using:
JavaScriptpad_result.keyword``Show more lines
instead of relying only on:
JavaScriptpcb_result.keywordShow more lines

3. Board Row Transform Logic
File:
Plain Texttransform.jsShow more lines
Updated:
JavaScriptboardBucketToRow()Show more lines
New logic:
Plain Textpad fail exists => FAILelse GOOD => GOODelse PASS/WARNING => PASSelse NG => FAILShow more lines

4. Board KPI Calculation
File:
Plain Textapp.jsShow more lines
Function:
JavaScriptcomputeBoardKpi()Show more lines
Changed from:
Plain TextboardCountboardPassboardFailShow more lines
to:
Plain TextboardCountboardGoodboardPassboardFailboardYieldShow more lines
Now classifies boards using:
Plain Textpcb_result+pad defectsShow more lines
instead of only:
Plain Textpcb_resultShow more lines

Remaining Work
UI KPI Cards
Current dashboard likely shows:
Plain TextBoardsPassFailYieldShow more lines
Needs to become:
Plain TextBoardsGoodPassFailYield``Show more lines
Review:
JavaScriptui.applyKpis()Show more lines
and KPI card rendering logic.

KPI Charts
Current board distribution chart likely shows:
Plain TextPASSFAILShow more lines
Should become:
Plain TextGOODPASSFAILShow more lines
Review:
JavaScriptbuildDashboardAggs()ui.applyKpis()chart rendering codeShow more lines

Expected Final Behaviour


Board ResultPad ResultDashboard ResultGOODAll GOODGOODPASSAll GOODPASSWARNINGAll GOODPASSNGAll GOODFAILGOODPOSITIONFAILPASSBRIDGINGFAILWARNINGLOW_HEIGHTFAIL

Next File To Review
The next code I need to see is:
JavaScriptui.applyKpis()Show more lines
because that's where the KPI cards and charts must be updated to display:
Plain TextGoodPassFailYieldShow more lines
instead of the old:
Plain TextPassFailYieldShow more lines
Provide your feedback on BizChat