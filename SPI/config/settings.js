/**
 * Dashboard runtime settings (timing, pagination, UI defaults).
 */
window.DASHBOARD_SETTINGS = {
  pageSize: 25,
  compositePageSize: 5000,
  boardCacheMs: 180_000,
  refreshMs: 120_000,
  healthMs: 60_000,
  fetchTimeoutMs: 35_000,
  defaultTimeRange: "all",

  timeLabels: {
    all: "All time",
    "15m": "Last 15 minutes",
    "1h": "Last 1 hour",
    "6h": "Last 6 hours",
    "24h": "Last 24 hours",
    "7d": "Last 7 days",
    "30d": "Last 30 days",
  },

  timeOrder: ["all", "15m", "1h", "6h", "24h", "7d", "30d"],

  esTimeRanges: {
    "15m": "now-15m",
    "1h": "now-1h",
    "6h": "now-6h",
    "24h": "now-24h",
    "7d": "now-7d",
    "30d": "now-30d",
  },

  resultColors: {
    GOOD: "#22c55e",
    PASS: "#f59e0b",
    FAIL: "#ef4444",
  },
};
