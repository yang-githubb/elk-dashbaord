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
    label: "SPI",
    description: "Solder paste inspection — board yield, pad defects, and serial search.",
    path: "/dashboards/spi/index.html",
    station: "SPI",
  },
  {
    id: "magicray",
    schemaKey: "MAGICRAY",
    label: "MagicRay",
    description: "FQI autotest — component results and failure Pareto.",
    path: "/dashboards/magicray/index.html",
    station: "FQI",
  }
];
