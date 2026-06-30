/**
 * AOI component-level inspection schema.
 * Field names aligned with AOI export / ELK documents (see sample CSV).
 *
 * Board header: panel_barcode, result (PASS/FAIL), program_name, machine (tester)
 * Component rows: ref_descrd_name, lead, comp_part_no, package_name,
 *                  machine_call, repair_status, operator_call, component_barcode
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
    serial: "panel_barcode",
    station: "station",
    machine: "machine",
  },

  resultMap: {
    GOOD: "GOOD",
    PASS: "PASS",
    FAIL: "FAIL",
    NG: "FAIL",
  },

  kpi: {
    // Board pass/fail — panel-level result on each document
    boardResultField: "result.keyword",
    boardFail: ["FAIL"],

    // Component KPIs — operator verdict per inspection row
    componentResultField: "operator_call.keyword",
    good: ["GOOD"],
    pass: [],
    fail: ["FAIL", "NG"],

    serialField: "panel_barcode.keyword",
    boardCountField: "ref_descrd_name",
    boardCountAgg: "cardinality",
  },

  detailSort: [
    { timestamp: { order: "desc" } },
    { "ref_descrd_name.keyword": { order: "asc" } },
    { "machine_call.keyword": { order: "asc" } },
  ],

  boardColumns: [
    { key: "serial", label: "Panel Barcode" },
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
    { key: "comp_part_no", label: "Comp Part #" },
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
    "comp_part_no",
    "package_name",
    "machine_call",
    "repair_status",
    "operator_call",
    "component_barcode",
    "program_name",
    "panel_barcode",
    "machine",
    "line",
    "result",
  ],
};
