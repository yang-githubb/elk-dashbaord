/**
 * SPI KPI analysis — breakdown by line and model.
 *
 * Board overview → board counts and board results
 * Pad overview   → pad counts and pad results
 */
(function () {
  const Dashboard = window.Dashboard;
  const { esClient, esQueries, ui } = Dashboard;

  const params = new URLSearchParams(window.location.search);
  const isPadView = params.get("view") === "pad";
  const filterState = {
    time: params.get("time") || Dashboard.config?.defaultTimeRange || "all",
    line: params.get("line") || "",
    model: params.get("model") || "",
  };

  Dashboard.state = {
    time: filterState.time,
    line: filterState.line,
    model: filterState.model,
  };

  function yieldPct(good, total) {
    return total > 0 ? ((good / total) * 100).toFixed(2) : "0.00";
  }

  function buildPadRow(bucket, keyName) {
    const good = bucket.count_good?.doc_count || 0;
    const fail = bucket.count_fail?.doc_count || 0;
    const total = good + (bucket.count_pass?.doc_count || 0) + fail;
    return {
      [keyName]: bucket.key,
      good,
      fail,
      total,
      yield: yieldPct(good, total),
    };
  }

  function buildBoardRow(bucket, keyName) {
    const counts = Dashboard.countNormalizedResults(
      bucket.board_results?.buckets || [],
      (result) => result.inspections?.value || 0
    );
    const boards = Math.round(bucket.boards?.value ?? bucket.doc_count ?? 0);
    const total = counts.good + counts.pass + counts.fail;
    return {
      [keyName]: bucket.key,
      boards,
      good: counts.good,
      pass: counts.pass,
      fail: counts.fail,
      total,
      yield: yieldPct(counts.good, total),
    };
  }

  function renderKpiTable(theadId, tbodyId, firstLabel, rows, keyName) {
    const thead = document.getElementById(theadId);
    const tbody = document.getElementById(tbodyId);
    if (!thead || !tbody) return;

    if (isPadView) {
      thead.innerHTML = `
        <tr>
          <th>${firstLabel}</th>
          <th>Good</th>
          <th>Fail</th>
          <th>Pads</th>
          <th>Yield %</th>
        </tr>`;
      tbody.innerHTML = rows
        .map(
          (row) => `
            <tr>
              <td>${row[keyName]}</td>
              <td>${row.good}</td>
              <td>${row.fail}</td>
              <td>${row.total}</td>
              <td>${row.yield}</td>
            </tr>`
        )
        .join("");
      return;
    }

    thead.innerHTML = `
      <tr>
        <th>${firstLabel}</th>
        <th>Boards</th>
        <th>Good</th>
        <th>Pass</th>
        <th>Fail</th>
        <th>Yield %</th>
      </tr>`;
    tbody.innerHTML = rows
      .map(
        (row) => `
          <tr>
            <td>${row[keyName]}</td>
            <td>${row.boards}</td>
            <td>${row.good}</td>
            <td>${row.pass}</td>
            <td>${row.fail}</td>
            <td>${row.yield}</td>
          </tr>`
      )
      .join("");
  }

  async function loadAnalysis() {
    const res = isPadView
      ? await esClient.search({
          size: 0,
          query: esQueries.buildEsQuery(esQueries.buildEsFilters()),
          aggs: esQueries.buildPadAnalysisAggs(),
        })
      : await esClient.searchBoard({
          size: 0,
          query: esQueries.buildEsQuery(esQueries.buildBoardFilters()),
          aggs: esQueries.buildBoardAnalysisAggs(),
        });

    const rowFn = isPadView ? buildPadRow : buildBoardRow;
    const lineRows = (res.aggregations?.lines?.buckets || [])
      .map((bucket) => rowFn(bucket, "line"))
      .sort((a, b) => (isPadView ? b.total - a.total : b.boards - a.boards));
    const modelRows = (res.aggregations?.models?.buckets || [])
      .map((bucket) => rowFn(bucket, "model"))
      .sort((a, b) => (isPadView ? b.total - a.total : b.boards - a.boards))
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

  const heading = document.querySelector(".panel-head h2");
  if (heading) {
    heading.textContent = isPadView ? "Pad Analysis" : "Board Analysis";
  }
  const hint = document.querySelector(".panel-hint");
  if (hint) {
    hint.textContent = isPadView
      ? "Pad KPI breakdown by Line and Model"
      : "Board count and result by Line and Model";
  }
  document.title = isPadView ? "SPI Pad Analysis" : "SPI Analysis";

  document.getElementById("back-dashboard")?.addEventListener("click", () => {
    window.location.href = "index.html";
  });

  loadAnalysis().catch((error) => {
    ui?.showError?.(error?.message || "Failed to load analysis");
  });
})();
