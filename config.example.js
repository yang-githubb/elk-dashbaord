/**
 * Dashboard configuration — copy to config.js and adjust for your environment.
 *
 * useMock: true  → offline development with sample SPI data (no VPN needed)
 * useMock: false → live Elasticsearch via proxy (python proxy.py)
 */
window.ES_CONFIG = {
  useMock: false,

  // Proxy endpoint (relative URL when served by proxy.py)
  proxyUrl: "/search",

  // Direct ES access (only if not using proxy)
  node: "https://elastic-sac-test.elkaas.flex.com",
  index: "flexh1smtmachinesdata-tan_meng_kiang-*",
  username: "",
  password: "",

  // Field mapping — matches factory SPI index schema
  fields: {
    time: "timestamp",
    line: "line",
    model: "pcb_name",
    serial: "array_barcode",
    station: "station",
  },
};
