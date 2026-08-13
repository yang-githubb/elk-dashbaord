/**
 * SPI schema — field maps and KPI rules.
 *
 * Board index (spi-board): array_barcode, pcb_result, inspection_date
 * Pad index  (jax optimizations): spi_array_barcode, spi_pad_result, spi_*
 */
window.DASHBOARD_SCHEMAS = window.DASHBOARD_SCHEMAS || {};

window.DASHBOARD_SCHEMAS.SPI = {
  id: "spi",
  label: "SPI",
  station: "SPI",
  isPadLevel: true,
  indexMode: "dual",

  features: {
    boardList: true,
    boardAnalysis: true,
    padAnalysis: true,
    paretoDrillDown: true,
  },

  labels: {
    pageTitle: "SMT Board Dashboard",
    boardOverview: "Board Overview",
    padOverview: "Pad Overview",
    paretoTitle: "Pad Failure Pareto Analysis",
    padTotal: "Total",
  },

  pages: {
    analysis: "analysis.html",
    padAnalysis: "pad-analysis.html",
  },

  boardHint: "Click a serial to view pad inspection data",
  detailTitle: "Pads for",
  detailCountLabel: "pads",
  kpiDetailLabel: "Pad",

  // jax / pad-level fields
  fields: {
    time: "spi_inspection_date",
    line: "line",
    model: "spi_pcb_name",
    serial: "spi_array_barcode",
    station: "station",
  },

  // spi-board fields (native keyword)
  boardFields: {
    time: "inspection_date",
    model: "pcb_name",
    serial: "array_barcode",
    station: "station",
    line: "line",
    machine: "machine",
  },

  resultMap: {
    GOOD: "GOOD",
    PASS: "PASS",
    WARNING: "PASS",
    NG: "FAIL",
  },

  kpi: {
    componentResultField: "spi_pad_result.keyword",
    good: ["GOOD"],
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
      "LOW_HEIGHT",
    ],
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
      "LOW_HEIGHT",
    ],

    boardResultField: "pcb_result",
    boardGood: ["GOOD"],
    boardPass: ["PASS", "WARNING"],
    boardFail: ["NG"],
    boardFailField: "pcb_result",

    serialField: "spi_array_barcode.keyword",
    boardSerialField: "array_barcode",
    serialSourceFields: ["array_barcode"],
    boardSerialSourceFields: ["array_barcode"],

    excludeEmptySerial: true,
    excludeLeadingUnderscoreSource: true,
    boardCountField: "spi_pad_no",
    boardSourceFileField: "source_file",
  },

  detailSort: [
    { spi_inspection_date: { order: "desc" } },
    { spi_pad_no: { order: "asc" } },
    { "spi_component_id.keyword": { order: "asc" } },
  ],

  boardColumns: [
    { key: "serial", label: "Serial", type: "serial" },
    { key: "model", label: "PCB Name" },
    { key: "line", label: "Line" },
    { key: "timestamp", label: "Last Inspection", type: "time" },
    { key: "pad_count", label: "Pads", type: "number" },
    { key: "result", label: "Result", type: "result" },
  ],

  padColumns: [
    { key: "spi_inspection_date", label: "Inspection Date", type: "time" },
    { key: "spi_pcb_name", label: "PCB Name" },
    { key: "line", label: "Line" },
    { key: "station", label: "Station" },
    { key: "machine", label: "Machine" },
    { key: "spi_component_id", label: "Component" },
    { key: "spi_pad_no", label: "Pad No", type: "number" },
    { key: "spi_volume", label: "Volume", type: "number" },
    { key: "spi_height", label: "Height", type: "number" },
    { key: "spi_area", label: "Area", type: "number" },
    { key: "spi_offset_x", label: "Offset X", type: "number" },
    { key: "spi_offset_y", label: "Offset Y", type: "number" },
    { key: "spi_pad_result", label: "Pad Result", type: "result" },
    { key: "spi_pcb_result", label: "PCB Result", type: "result" },
  ],

  padSourceFields: [
    "spi_inspection_date",
    "spi_pcb_name",
    "line",
    "station",
    "machine",
    "spi_array_barcode",
    "spi_component_id",
    "spi_pad_no",
    "spi_volume",
    "spi_height",
    "spi_area",
    "spi_offset_x",
    "spi_offset_y",
    "spi_pad_result",
    "spi_pcb_result",
    "source_file",
  ],
};
