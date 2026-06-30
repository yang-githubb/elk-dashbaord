/**
 * Elasticsearch cluster definitions — pick one in config.js via `environment`.
 *
 * Proxy credentials live in proxy.py (or ES_USERNAME / ES_PASSWORD env vars).
 * Keep node/index here in sync with proxy when using proxyUrl.
 */
window.DASHBOARD_ENVIRONMENTS = {
  "factory-sac": {
    label: "Factory SAC Test",
    node: "https://elastic-sac-test.elkaas.flex.com",
    index: "flexh1smtmachinesdata-tan_meng_kiang-*",
    proxyUrl: "/search",
    username: "",
    password: "",
  },
};
