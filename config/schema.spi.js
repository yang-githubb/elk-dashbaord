/** SPI pad-level inspection schema */
window.DASHBOARD_SCHEMAS = window.DASHBOARD_SCHEMAS || {};

window.DASHBOARD_SCHEMAS.SPI = {
  id: "spi",
  label: "SPI",
  station: "SPI",
  isPadLevel: true,

  fields: {
    time: "timestamp",
    line: "line",
    model: "pcb_name",
    serial: "array_barcode",
    station: "station",
  },

  resultMap: {
    GOOD: "GOOD",
    PASS: "PASS",
    WARNING: "PASS",
    NG: "FAIL",
  },

  kpi: {
    good: ["GOOD"],
    pass: ["PASS", "WARNING"],
    fail: ["NG"],
    serialField: "array_barcode.keyword",
    resultField: "pcb_result.keyword",
    boardCountField: "pad_no",
  },

  boardColumns: [
    { key: "serial", label: "Serial" },
    { key: "model", label: "PCB Name" },
    { key: "line", label: "Line" },
    { key: "timestamp", label: "Last Inspection", type: "time" },
    { key: "pad_count", label: "Pads", type: "number" },
    { key: "result", label: "Result", type: "result" },
  ],

  padColumns: [
    { key: "timestamp", label: "Timestamp", type: "time" },
    { key: "model", label: "PCB Name" },
    { key: "line", label: "Line" },
    { key: "station", label: "Station" },
    { key: "machine", label: "Machine" },
    { key: "component_id", label: "Component" },
    { key: "pad_no", label: "Pad No" },
    { key: "volume", label: "Volume", type: "number" },
    { key: "height", label: "Height", type: "number" },
    { key: "area", label: "Area", type: "number" },
    { key: "offset_x", label: "Offset X", type: "number" },
    { key: "offset_y", label: "Offset Y", type: "number" },
    { key: "is_defect", label: "Defect", type: "bool" },
    { key: "inspection_date", label: "Insp. Date" },
  ],

  padSourceFields: [
    "timestamp", "pcb_name", "line", "station", "machine",
    "component_id", "pad_no", "volume", "height", "area", "offset_x", "offset_y",
    "is_defect", "inspection_date",
  ],
};
