/**
 * Merges environment + schema + user overrides into Dashboard.config.
 */
(function () {
  window.Dashboard = window.Dashboard || {};
  window.DASHBOARD_SCHEMAS = window.DASHBOARD_SCHEMAS || {};

  const user = window.DASHBOARD_USER_CONFIG || {};
  const environments = window.DASHBOARD_ENVIRONMENTS || {};
  const settings = window.DASHBOARD_SETTINGS || {};
  const overrides = user.overrides || {};

  const envKey = user.environment || Object.keys(environments)[0];
  const env = environments[envKey] || {};
  const defaultStation = user.defaultStation || "SPI";

  const baseConfig = {
    environment: envKey,
    environmentLabel: env.label || envKey,

    proxyUrl: env.proxyUrl,
    node: env.node,
    index: env.index,
    username: env.username || "",
    password: env.password || "",

    pageSize: overrides.pageSize ?? settings.pageSize ?? 25,
    compositePageSize: settings.compositePageSize ?? 5000,
    boardCacheMs: settings.boardCacheMs ?? 180_000,
    refreshMs: settings.refreshMs ?? 120_000,
    healthMs: settings.healthMs ?? 60_000,
    fetchTimeoutMs: settings.fetchTimeoutMs ?? 35_000,
    defaultTimeRange: overrides.defaultTimeRange ?? settings.defaultTimeRange ?? "all",
    defaultStation,
    timeLabels: settings.timeLabels || {},
    timeOrder: settings.timeOrder || [],
    esTimeRanges: settings.esTimeRanges || {},
    resultColors: settings.resultColors || {},
  };

  Dashboard.config = baseConfig;

  Dashboard.applyStationSchema = function applyStationSchema(station) {
    const schema = window.DASHBOARD_SCHEMAS[station] || window.DASHBOARD_SCHEMAS.SPI;
    if (!schema) return;

    Object.assign(Dashboard.config, {
      station: schema.station,
      schemaId: schema.id,
      schemaLabel: schema.label,
      isPadLevel: schema.isPadLevel !== false,
      fields: { ...schema.fields, ...(overrides.fields || {}) },
      resultMap: schema.resultMap || {},
      kpi: schema.kpi || {},
      boardColumns: schema.boardColumns || [],
      padColumns: schema.padColumns || [],
      padSourceFields: schema.padSourceFields || [],
    });

    window.ES_CONFIG = {
      proxyUrl: Dashboard.config.proxyUrl,
      node: Dashboard.config.node,
      index: Dashboard.config.index,
      username: Dashboard.config.username,
      password: Dashboard.config.password,
      fields: Dashboard.config.fields,
    };
  };

  Dashboard.applyStationSchema(defaultStation);
})();
