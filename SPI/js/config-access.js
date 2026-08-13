/** Config accessors */
(function (D) {
  function cfg() {
    return D.config || {};
  }

  D.isPadLevel = () => cfg().isPadLevel !== false;
  D.getFields = () => cfg().fields || {};
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
  D.getBoardFields = () => cfg().boardFields || {};
  D.esField = (field) => {
    if (typeof field !== "string" || !field) {
      return "";
    }
    return field.includes(".") ? field : `${field}.keyword`;
  };

  D.normalizeResult = (value) => {
    const map = cfg().resultMap || {};
    const key = String(value || "").toUpperCase();
    return map[key] || "PASS";
  };
})(window.Dashboard = window.Dashboard || {});
