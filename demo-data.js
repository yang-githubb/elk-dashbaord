(function () {
  const LINES = ["Line-1", "Line-2", "Line-3"];
  const MODELS = ["627-351-12A", "627-352-10B", "628-100-01C"];
  const NOW = Date.now();
  const DAY_MS = 24 * 60 * 60 * 1000;

  const synthetic = [];

  for (let i = 0; i < 100; i++) {
    const dayOffset = i % 60;
    const hoursAgo = dayOffset * 24 + (i % 12);
    const timestamp = new Date(NOW - hoursAgo * 60 * 60 * 1000 - (i % 30) * 60 * 1000);

    let result = "GOOD";
    let general = "PASS";
    if (i % 13 === 0) {
      result = "FAIL";
      general = "FAIL";
    } else if (i % 7 === 0) {
      result = "PASS";
      general = "PASS";
    }

    const serial = `BRD-${String(10000 + i)}`;
    synthetic.push({
      id: `syn-${i + 1}`,
      "@timestamp": timestamp.toISOString(),
      line: LINES[i % LINES.length],
      model: MODELS[i % MODELS.length],
      serial,
      board_id: serial,
      station: `ST-${String((i % 6) + 1).padStart(2, "0")}`,
      status: result === "FAIL" ? "ERROR" : "OK",
      result,
      general,
      pad_result: result === "GOOD" ? "GOOD" : result,
      cycle_time_ms: 1100 + (i % 17) * 45,
      source: "synthetic",
    });
  }

  const csv = window.DEMO_CSV_RECORDS ?? [];
  window.DEMO_RECORDS = [...synthetic, ...csv].sort(
    (a, b) => new Date(b["@timestamp"]) - new Date(a["@timestamp"]),
  );
})();
