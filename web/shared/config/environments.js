/**
 * Elasticsearch cluster definitions — pick one in user.js via `environment`.
 *
 * Proxy credentials live in proxy.py (or ES_USERNAME / ES_PASSWORD env vars).
 * Keep node/index here in sync with proxy when using proxyUrl.
 */
window.DASHBOARD_ENVIRONMENTS = {
  "factory-sac": {
    label: "Factory SAC Test",
    node: "https://elastic-sac-platinum.elkaas.flex.com",
    index: "flexh1smtmachinesdata00589-*",
    proxyUrl: "/search",
    username: "",
    password: "",
  },
};
