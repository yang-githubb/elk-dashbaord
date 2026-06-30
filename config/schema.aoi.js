/**
 * AOI component-level inspection schema.
 *
 * Unified ELK index stores the panel barcode in array_barcode (same as SPI).
 * panel_barcode / barcode are fallbacks. panel_id is numeric — never group on it.
 */
window.DASHBOARD_SCHEMAS = window.DASHBOARD_SCHEMAS || {};

window.DASHBOARD_SCHEMAS.AOI = {
  id: "aoi",
  label: "AOI",
  station: "AOI",
  isPadLevel: true,

  boardHint: "Click a panel barcode to view component inspections",
  detailTitle: "Components for",
  detailCountLabel: "components",
  kpiDetailLabel: "Component",

  fields: {
    time: "timestamp",
    line: "line",
    model: "program_name",
    serial: "array_barcode",
    station: "station",
    machine: "tester_name",
  },

  resultMap: {
    GOOD: "GOOD",
    PASS: "PASS",
    FAIL: "FAIL",
    NG: "FAIL",
  },

  kpi: {
    boardResultField: "result.keyword",
    boardFail: ["FAIL"],
    excludeEmptySerial: true,
    excludeLeadingUnderscoreSource: true,

    componentResultField: "operator_call.keyword",
    good: ["GOOD"],
    pass: [],
    fail: ["FAIL", "NG"],

    serialField: "array_barcode.keyword",
    serialSourceFields: ["array_barcode", "panel_barcode", "barcode", "source_file"],
    boardCountField: "ref_descrd_name",
    boardCountAgg: "cardinality",
  },

  detailSort: [
    { timestamp: { order: "desc" } },
    { "ref_descrd_name.keyword": { order: "asc" } },
    { "machine_call.keyword": { order: "asc" } },
  ],

  boardColumns: [
    { key: "serial", label: "Panel Barcode", type: "serial" },
    { key: "model", label: "Program" },
    { key: "machine", label: "Tester" },
    { key: "line", label: "Line" },
    { key: "timestamp", label: "Test Time", type: "time" },
    { key: "pad_count", label: "Components", type: "number" },
    { key: "result", label: "Result", type: "result" },
  ],

  padColumns: [
    { key: "timestamp", label: "Test Time", type: "time" },
    { key: "ref_des", label: "Ref Des", source: "ref_descrd_name" },
    { key: "lead", label: "Lead" },
    { key: "comp_part_no", label: "Comp Part #", source: "comp_part_num" },
    { key: "package_name", label: "Package" },
    { key: "machine_call", label: "Machine Call" },
    { key: "repair_status", label: "Repair Status" },
    { key: "operator_call", label: "Operator Call", type: "result" },
    { key: "component_barcode", label: "Component Barcode" },
  ],

  padSourceFields: [
    "timestamp",
    "ref_descrd_name",
    "lead",
    "comp_part_num",
    "package_name",
    "machine_call",
    "repair_status",
    "operator_call",
    "component_barcode",
    "program_name",
    "array_barcode",
    "panel_barcode",
    "barcode",
    "tester_name",
    "machine",
    "line",
    "result",
    "source_file",
  ],
};
