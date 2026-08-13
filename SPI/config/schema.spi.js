/** SPI pad-level inspection schema (FIXED + CLEAN) */
window.DASHBOARD_SCHEMAS = window.DASHBOARD_SCHEMAS || {};

window.DASHBOARD_SCHEMAS.SPI = {
  id: "spi",
  label: "SPI",
  station: "SPI",
  isPadLevel: true,

  // ================= UI =================
  boardHint: "Click a serial to view pad inspection data",
  detailTitle: "Pads for",
  detailCountLabel: "pads",
  kpiDetailLabel: "Pad",

  // ================= FIELD MAPPING =================
  fields: {
    time: "spi_inspection_date",
    line: "line",
    model: "spi_pcb_name",
    serial: "spi_array_barcode", // ✅ SPI board identity
    station: "station",
  },
  boardFields: {
    time: "inspection_date",
    model: "pcb_name",
    serial: "array_barcode",
    station: "station",
    line: "line"
  },
  // ================= RESULT NORMALIZATION =================
  // Used only for UI coloring / labels
  resultMap: {
    GOOD: "GOOD",
    PASS: "PASS",
    WARNING: "PASS",
    NG: "FAIL",
  },

  // ================= KPI LOGIC =================
  kpi: {

    // =====================================================
    // PAD LEVEL
    // =====================================================

    componentResultField: "spi_pad_result.keyword",

    good: [
      "GOOD"
    ],

    pass: [],

    fail: [
      "EXCESSIVE_VOLUME",
      "INSUFFICIENT_VOLUME",
      "POSITION",
      "BRIDGING",
      "SMEAR",
      "HIGH_AREA",
      "LOW_AREA",
      "SHAPE",
      "UPPER_HEIGHT",
      "LOW_HEIGHT"
    ],

    // Used for board fail calculation
    padFailResults: [
      "EXCESSIVE_VOLUME",
      "INSUFFICIENT_VOLUME",
      "POSITION",
      "BRIDGING",
      "SMEAR",
      "HIGH_AREA",
      "LOW_AREA",
      "SHAPE",
      "UPPER_HEIGHT",
      "LOW_HEIGHT"
    ],

    // =====================================================
    // BOARD LEVEL
    // =====================================================

    boardResultField: "pcb_result",

    boardGood: [
      "GOOD"
    ],

    boardPass: [
      "PASS",
      "WARNING"
    ],

    boardFail: [
      "NG"
    ],

    boardFailField: "pcb_result",

    // =====================================================
    // BOARD IDENTITY
    // =====================================================

    serialField: "spi_array_barcode.keyword",
    boardSerialField: "array_barcode",
    serialSourceFields: [
      "array_barcode"
    ],
    boardSerialSourceFields: [
      "array_barcode"
    ],

    // =====================================================
    // DATA CLEANUP
    // =====================================================

    excludeEmptySerial: true,

    excludeLeadingUnderscoreSource: true,

    // =====================================================
    // PAD COUNT
    // =====================================================

    boardCountField: "pad_no"
  },


  // ================= SORT =================
  detailSort: [
    { inspection_date: { order: "desc" } },
    { pad_no: { order: "asc" } },
    { "component_id.keyword": { order: "asc" } },
  ],

  // ================= TABLE: BOARD =================
  boardColumns: [
    { key: "serial", label: "Serial", type: "serial" },
    { key: "model", label: "PCB Name" },
    { key: "line", label: "Line" },
    { key: "timestamp", label: "Last Inspection", type: "time" },
    { key: "pad_count", label: "Pads", type: "number" },
    { key: "result", label: "Result", type: "result" },
  ],

  // ================= TABLE: PAD =================
  padColumns: [
    { key: "inspection_date", label: "inspection_date", type: "time" },
    { key: "model", label: "PCB Name", source: "pcb_name" },
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
    { key: "pad_result", label: "Pad Result", type: "result" },
    { key: "is_defect", label: "Defect", type: "bool" },
    { key: "inspection_date", label: "Insp. Date" },
  ],

  // ================= SOURCE FIELDS =================
  padSourceFields: [
    "inspection_date",
    "pcb_name",
    "line",
    "station",
    "machine",
    "array_barcode",
    "component_id",
    "pad_no",
    "volume",
    "height",
    "area",
    "offset_x",
    "offset_y",
    "pad_result",
    "pcb_result",
    "is_defect",
    "inspection_date",
    "source_file",
  ],
};
``