/** Config accessors */
(function (D) {
  function cfg() {
    return D.config || {};
  }

  D.useMock = () => cfg().useMock === true;
  D.isPadLevel = () => cfg().isPadLevel !== false;
  D.getFields = () => cfg().fields || {};
  D.getStation = () => cfg().station || "SPI";
  D.getKpi = () => cfg().kpi || {};
  D.getBoardColumns = () => cfg().boardColumns || [];
  D.getPadColumns = () => cfg().padColumns || [];
  D.getPadSourceFields = () => cfg().padSourceFields || [];
  D.getResultColors = () => cfg().resultColors || {};
  D.getTimeLabels = () => cfg().timeLabels || {};
  D.getTimeOrder = () => cfg().timeOrder || [];
  D.getEsTimeRanges = () => cfg().esTimeRanges || {};

  D.esField = (field) => (field.includes(".") ? field : `${field}.keyword`);

  D.normalizeResult = (value) => {
    const map = cfg().resultMap || {};
    const key = String(value || "").toUpperCase();
    return map[key] || "PASS";
  };

  D.applyProfileBanner = () => {
    const c = cfg();
    const banner = document.getElementById("mock-banner");
    if (!banner) return;
    if (c.showBanner && c.bannerMessage) {
      banner.innerHTML = c.bannerMessage;
    }
    banner.classList.toggle("hidden", !c.showBanner);
  };
})(window.Dashboard = window.Dashboard || {});
