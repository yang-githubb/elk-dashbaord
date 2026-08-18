/**
 * Schema / config accessors used by queries, UI, and pages.
 *
 * esField()      — jax/detail text fields → field.keyword
 * esBoardField() — spi-board native keyword fields, used as-is
 */
(function (D) {
  function cfg() {
    return D.config || {};
  }

  D.isPadLevel = () => cfg().isPadLevel !== false;
  D.getIndexMode = () => cfg().indexMode || "dual";
  D.hasFeature = (name) => cfg().features?.[name] === true;
  D.getLabel = (key, fallback = "") => cfg().labels?.[key] ?? fallback;
  D.pageUrl = (pageKey) => cfg().pages?.[pageKey] || `${pageKey}.html`;
  D.getFields = () => cfg().fields || {};
  D.getBoardFields = () => cfg().boardFields || {};
  D.getKpi = () => cfg().kpi || {};
  D.getBoardColumns = () => cfg().boardColumns || [];
  D.getPadColumns = () => cfg().padColumns || [];
  D.getPadSourceFields = () => cfg().padSourceFields || [];
  D.getDetailSort = () => cfg().detailSort || null;
  D.getBoardHint = () => cfg().boardHint || "Click a serial to view inspection data";
  D.getDetailTitle = () => cfg().detailTitle || "Inspections for";
  D.getDetailCountLabel = () => cfg().detailCountLabel || "records";
  D.getKpiDetailLabel = () => cfg().kpiDetailLabel || "Pad";
  D.getResultColors = () => cfg().resultColors || {};
  D.getTimeLabels = () => cfg().timeLabels || {};
  D.getTimeOrder = () => cfg().timeOrder || [];
  D.getEsTimeRanges = () => cfg().esTimeRanges || {};

  D.esField = (field) => {
    if (typeof field !== "string" || !field) return "";

    if (cfg().indexMode === "single") {
      return field;
    }

    return field.includes(".") ? field : `${field}.keyword`;
  };

  D.esBoardField = (field) => {
    if (typeof field !== "string" || !field) return "";
    return field;
  };

  /** Map a raw ES result value to GOOD / PASS / FAIL. */
  D.normalizeResult = (value) => {
    const map = cfg().resultMap || {};
    const kpi = cfg().kpi || {};
    const key = String(value || "").toUpperCase();

    if (map[key]) return map[key];

    const fail = (kpi.fail || []).map((item) => String(item).toUpperCase());
    const good = (kpi.good || []).map((item) => String(item).toUpperCase());
    if (fail.includes(key)) return "FAIL";
    if (good.includes(key)) return "GOOD";
    return "PASS";
  };

  /** Sum GOOD / PASS / FAIL from terms buckets. */
  D.countNormalizedResults = (buckets, getCount) => {
    let good = 0;
    let pass = 0;
    let fail = 0;

    for (const bucket of buckets || []) {
      const count = getCount(bucket);
      const normalized = D.normalizeResult(bucket.key);
      if (normalized === "GOOD") good += count;
      else if (normalized === "PASS" || normalized === "WARNING") pass += count;
      else if (normalized === "FAIL") fail += count;
    }

    return { good, pass, fail };
  };
})(window.Dashboard = window.Dashboard || {});
