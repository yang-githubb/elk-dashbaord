/**
 * Data source profiles — pick one in config.js via `profile`.
 *
 * mock  → local sample data (mock-es.js), no VPN
 * live  → Elasticsearch (uses `environment` from environments.js)
 */
window.DASHBOARD_PROFILES = {
  mock: {
    label: "Mock / Demo",
    dataSource: "mock",
    showBanner: true,
    bannerMessage: "Demo mode — sample SPI data. Set profile to \"live\" in config.js for Elasticsearch.",
  },
  live: {
    label: "Live Elasticsearch",
    dataSource: "elk",
    showBanner: false,
    bannerMessage: "",
  },
};
