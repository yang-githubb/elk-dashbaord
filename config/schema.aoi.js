/**
 * AOI Component-Level Inspection Schema
 *
 * Board KPI:
 *   barcode -> unique board identity
 *   result  -> PASS / NG
 *
 * Component KPI:
 *   operator_call -> GOOD / defect type
 */

window.DASHBOARD_SCHEMAS = window.DASHBOARD_SCHEMAS || {};

window.DASHBOARD_SCHEMAS.AOI = {
  id: "aoi",
  label: "AOI",
  station: "AOI",
  isPadLevel: true,

  // ============================================================
  // UI
  // ============================================================

  boardHint: "Click a barcode to view component inspections",
  detailTitle: "Components for",
  detailCountLabel: "components",
  kpiDetailLabel: "Component",

  // ============================================================
  // FIELD MAPPING
  // ============================================================

  fields: {
    time: "timestamp",
    line: "line",
    model: "program_name",

    // Master board identity
    serial: "barcode",

    station: "station",
    machine: "tester_name",
  },

  // ============================================================
  // RESULT NORMALIZATION
  // ============================================================

  resultMap: {
    GOOD: "GOOD",

    PASS: "PASS",

    NG: "FAIL",
    FAIL: "FAIL",

    MISSING: "FAIL",
    SOLDER_JOINT: "FAIL",
    PADOVERHANG: "FAIL",
    LIFTED_LEAD: "FAIL",
    OVERHANG: "FAIL",
    BRIDGING: "FAIL",
    MISSING_LEAD: "FAIL",
    DIMENSION: "FAIL",
    LIFTED_BODY: "FAIL",
    POLARITY: "FAIL",
    UPSIDEDOWN: "FAIL",
    OCR_OCV: "FAIL",
    FOREIGNMATERIAL_LEAD: "FAIL",
    COPLANARITY: "FAIL",
    COMPONENT_SHIFT: "FAIL",
    TOMBSTONE: "FAIL",
    FOREIGNMATERIAL_BODY: "FAIL",
  },

  // ============================================================
  // KPI LOGIC
  // ============================================================

  kpi: {
    // ------------------------
    // BOARD KPI
    // ------------------------

    boardResultField: "result.keyword",
    boardFailField: "result.keyword",

    // AOI board failures are NG
    boardFail: ["NG"],

    requireSerialField: "barcode",
    excludeEmptySerial: true,

    // ------------------------
    // COMPONENT KPI
    // ------------------------

    componentResultField: "operator_call.keyword",

    good: [],

    pass: ["GOOD"],

    fail: [
      "MISSING",
      "SOLDER_JOINT",
      "PADOVERHANG",
      "LIFTED_LEAD",
      "OVERHANG",
      "BRIDGING",
      "MISSING_LEAD",
      "DIMENSION",
      "LIFTED_BODY",
      "POLARITY",
      "UPSIDEDOWN",
      "OCR_OCV",
      "FOREIGNMATERIAL_LEAD",
      "COPLANARITY",
      "COMPONENT_SHIFT",
      "TOMBSTONE",
      "FOREIGNMATERIAL_BODY",
    ],

    // ------------------------
    // BOARD IDENTITY
    // ------------------------

    serialField: "barcode.keyword",

    // Avoid duplicate board identities
    serialSourceFields: ["barcode"],

    // Component count per board
    boardCountField: "ref_descrd_name",
    boardCountAgg: "cardinality",
  },

  // ============================================================
  // DETAIL SORTING
  // ============================================================

  detailSort: [
    { timestamp: { order: "desc" } },
    { "ref_descrd_name.keyword": { order: "asc" } },
    { "machine_call.keyword": { order: "asc" } },
  ],

  // ============================================================
  // BOARD TABLE
  // ============================================================

  boardColumns: [
    { key: "serial", label: "Barcode", type: "serial" },
    { key: "model", label: "Program" },
    { key: "machine", label: "Tester" },
    { key: "line", label: "Line" },
    { key: "timestamp", label: "Test Time", type: "time" },
    { key: "pad_count", label: "Components", type: "number" },
    { key: "result", label: "Result", type: "result" },
  ],

  // ============================================================
  // COMPONENT TABLE
  // ============================================================

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

  // ============================================================
  // ES SOURCE FIELDS
  // ============================================================

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
    "barcode",
    "panel_barcode",
    "tester_name",
    "machine",
    "line",
    "result",
    "source_file",
  ],
};