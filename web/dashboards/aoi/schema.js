/** MagicRay inspection schema */
window.DASHBOARD_SCHEMAS = window.DASHBOARD_SCHEMAS || {};

window.DASHBOARD_SCHEMAS.MAGICRAY = {
  id: "magicray",
  label: "MagicRay",
  station: "FQI_AUTOTEST",
  stationValue: "FQI_AUTOTEST",
  isPadLevel: true,
  indexMode: "single",
  bodyClass: "magicray",

  features: {
    boardList: false,
    boardAnalysis: false,
    padAnalysis: false,
    paretoDrillDown: false,
  },

  labels: {
    pageTitle: "MagicRay Dashboard",
    boardOverview: "Board Overview",
    padOverview: "Component Overview",
    paretoTitle: "Failure Pareto Analysis",
    padTotal: "Total Report Fail",
  },

  pages: {},

  boardHint: "Click a source_file to view component inspection data",
  detailTitle: "Components for",
  detailCountLabel: "components",
  kpiDetailLabel: "Component",

  fields: {
    time: "inspectiondate",
    line: "line",
    model: "modelname",
    serial: "source_file",
    station: "station",
  },

  resultMap: {
    OK: "GOOD",
    P: "PASS",
    PASS: "PASS",
    F: "FAIL",
    FAIL: "FAIL",
    G: "GOOD",
    SHORT: "FAIL",
    OPEN: "FAIL",
    KNOCKOFF: "FAIL",
    LIFTEDPADS: "FAIL",
    MISSING: "FAIL",
    "DAMAGE COMP": "FAIL",
    MISALIGNMENT: "FAIL",
    BRIDGING: "FAIL",
    "INSUFF SOLDER": "FAIL",
    WRONGORIENTATION: "PASS",
  },

  kpi: {
    componentResultField: "confirmedresult",

    good: ["OK"],
    pass: ["NONE", "WrongOrientation"],
    fail: [
      "Short",
      "Open",
      "Bridge",
      "ShortOpen",
      "NG",
      "F",
      "FAIL",
      "KnockOff",
      "LiftedPads",
      "Missing",
      "Damage Comp",
      "Misalignment",
      "Bridging",
      "Insuff Solder",
      "LiftedLead",
      "Wrong Part",
      "LessTin",
    ],

    padFailResults: [
      "Short",
      "Open",
      "Bridge",
      "ShortOpen",
      "F",
      "FAIL",
      "KnockOff",
      "LiftedPads",
      "Missing",
      "Damage Comp",
      "Misalignment",
      "Bridging",
      "Insuff Solder",
      "LiftedLead",
      "Wrong Part",
      "LessTin",
    ],

    boardResultField: "sum_confirmed_result",
    boardGood: ["GOOD", "G"],
    boardPass: ["P", "PASS"],
    boardFail: ["F", "FAIL"],

    serialField: "source_file",
    serialSourceFields: [
      "source_file"
    ],

    excludeEmptySerial: false,
    excludeLeadingUnderscoreSource: false,

    boardCountField: "componentname"
  },

  detailSort: [
    { timestamp: { order: "desc" } },
    { "componentname": { order: "asc" } }
  ],

  boardColumns: [
    { key: "serial", label: "source_file", type: "serial" },
    { key: "model", label: "Model" },
    { key: "line", label: "Line" },
    { key: "timestamp", label: "Last Inspection", type: "time" },
    { key: "pad_count", label: "Components", type: "number" },
    { key: "result", label: "Result", type: "result" },
  ],

  padColumns: [
    { key: "timestamp", label: "Timestamp", type: "time" },
    { key: "model", label: "Model", source: "modelname" },
    { key: "line", label: "Line" },
    { key: "station", label: "Station" },
    { key: "machine", label: "Machine" },
    { key: "componentname", label: "Component" },
    { key: "reportresult", label: "Report Result" },
    { key: "confirmedresult", label: "Confirmed Result" },
    { key: "reportresultcode", label: "Report Result Code", type: "number" },
    { key: "confirmedresultcode", label: "Confirmed Result Code", type: "number" },
    { key: "inspectiondate", label: "Inspection Date" },
  ],

  padSourceFields: [
    "timestamp",
    "modelname",
    "line",
    "station",
    "machine",
    "source_file",
    "componentname",
    "reportresult",
    "confirmedresult",
    "reportresultcode",
    "confirmedresultcode",
    "inspectiondate",
    "sum_report_result",
    "sum_confirmed_result",
  ],
};
