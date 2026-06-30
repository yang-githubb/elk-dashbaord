/** AOI component-level inspection schema (board list only — no pad drill-down) */
window.DASHBOARD_SCHEMAS = window.DASHBOARD_SCHEMAS || {};

window.DASHBOARD_SCHEMAS.AOI = {
  id: "aoi",
  label: "AOI",
  station: "AOI",
  isPadLevel: false,

  fields: {
    time: "timestamp",
    line: "line",
    model: "program_name",
    serial: "panel_barcode",
    station: "station",
  },

  resultMap: {
    GOOD: "GOOD",
    PASS: "PASS",
    FAIL: "FAIL",
  },

  kpi: {
    good: ["GOOD"],
    pass: ["PASS"],
    fail: ["FAIL"],
    serialField: "panel_barcode.keyword",
    resultField: "result.keyword",
    boardCountField: "_index",
  },

  boardColumns: [
    { key: "serial", label: "Panel Barcode" },
    { key: "model", label: "Program" },
    { key: "line", label: "Line" },
    { key: "timestamp", label: "Last Inspection", type: "time" },
    { key: "pad_count", label: "Components", type: "number" },
    { key: "result", label: "Result", type: "result" },
  ],

  padColumns: [],
  padSourceFields: [],
};
