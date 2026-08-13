/**
 * Central registry of dashboards.
 *
 * To add a new data source:
 * 1. Create dashboards/<id>/ with index.html + schema.js
 * 2. Add an entry below
 * 3. Register any extra pages (analysis, exports) in the schema pages map
 */
window.DASHBOARD_REGISTRY = [
  {
    id: "spi",
    schemaKey: "SPI",
    label: "SPI Dashboard",
    description: "Solder paste inspection — board KPIs from spi-board, pad KPIs from jax optimizations.",
    path: "dashboards/spi/index.html",
    station: "SPI",
  },
  {
    id: "magicray",
    schemaKey: "MAGICRAY",
    label: "MagicRay Dashboard",
    description: "FQI autotest component inspection — single-index KPIs and failure pareto.",
    path: "dashboards/magicray/index.html",
    station: "FQI_AUTOTEST",
  },
];
