/**
 * Optional user overrides — environment, page size, time range.
 * Cluster URLs/index patterns: shared/config/environments.js
 */
window.DASHBOARD_USER_CONFIG = {
  ...(window.DASHBOARD_USER_CONFIG || {}),
  environment: "factory-sac",

  // overrides: {
  //   defaultTimeRange: "24h",
  //   pageSize: 50,
  // },
};
