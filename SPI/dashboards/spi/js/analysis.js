/**
 * SPI board analysis — KPI breakdown by line and model.
 * Reads time/line/model from the dashboard URL query.
 */
(function () {
  const Dashboard = window.Dashboard;
  const { esClient, esQueries, ui } = Dashboard;

  const params = new URLSearchParams(window.location.search);
  const filterState = {
    time: params.get("time") || "all",
    line: params.get("line") || "",
    model: params.get("model") || "",
  };

  Dashboard.state = {
    time: filterState.time,
    line: filterState.line,
    model: filterState.model,
  };

  function buildKpiRow(bucket, keyName) {
    const counts = Dashboard.countNormalizedResults(
      bucket.board_results?.buckets || [],
      (result) => result.inspections?.value || 0
    );
    const total = counts.good + counts.pass + counts.fail;

    return {
      [keyName]: bucket.key,
      good: counts.good,
      pass: counts.pass,
      fail: counts.fail,
      total,
      yield: total > 0 ? ((counts.good / total) * 100).toFixed(2) : "0.00",
    };
  }

  function renderKpiTable(theadId, tbodyId, firstLabel, rows, keyName) {
    const thead = document.getElementById(theadId);
    const tbody = document.getElementById(tbodyId);
    if (!thead || !tbody) return;

    thead.innerHTML = `
      <tr>
        <th>${firstLabel}</th>
        <th>Good</th>
        <th>Pass</th>
        <th>Fail</th>
        <th>Total</th>
        <th>Yield %</th>
      </tr>`;

    tbody.innerHTML = rows
      .map(
        (row) => `
          <tr>
            <td>${row[keyName]}</td>
            <td>${row.good}</td>
            <td>${row.pass}</td>
            <td>${row.fail}</td>
            <td>${row.total}</td>
            <td>${row.yield}</td>
          </tr>`
      )
      .join("");
  }

  async function loadAnalysis() {
    const res = await esClient.searchBoard({
      size: 0,
      query: esQueries.buildEsQuery(esQueries.buildBoardFilters()),
      aggs: esQueries.buildBoardAnalysisAggs(),
    });

    const lineRows = (res.aggregations?.lines?.buckets || [])
      .map((bucket) => buildKpiRow(bucket, "line"))
      .sort((a, b) => b.total - a.total);

    const modelRows = (res.aggregations?.models?.buckets || [])
      .map((bucket) => buildKpiRow(bucket, "model"))
      .sort((a, b) => b.total - a.total)
      .slice(0, 50);

    renderKpiTable("line-kpi-thead", "line-kpi-tbody", "Line", lineRows, "line");
    renderKpiTable(
      "model-kpi-thead",
      "model-kpi-tbody",
      "Model",
      modelRows,
      "model"
    );
  }

  document.getElementById("back-dashboard")?.addEventListener("click", () => {
    window.location.href = "index.html";
  });

  loadAnalysis().catch((error) => {
    ui?.showError?.(error?.message || "Failed to load analysis");
  });
})();
