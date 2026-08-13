/**
 * SPI KPI analysis — breakdown by line and model.
 *
 * Board overview click → analysis.html
 * Pad overview click   → analysis.html?view=pad  (pad KPIs + board counts)
 */
(function () {
  const Dashboard = window.Dashboard;
  const { esClient, esQueries, ui } = Dashboard;

  const params = new URLSearchParams(window.location.search);
  const isPadView = params.get("view") === "pad";
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

  function boardCountFromBucket(bucket) {
    return Math.round(bucket?.boards?.value ?? bucket?.doc_count ?? 0);
  }

  function padCountsFromBucket(bucket) {
    const good = bucket?.count_good?.doc_count || 0;
    const pass = bucket?.count_pass?.doc_count || 0;
    const fail = bucket?.count_fail?.doc_count || 0;
    const total = good + pass + fail;
    return {
      good,
      pass,
      fail,
      total,
      yield: total > 0 ? ((good / total) * 100).toFixed(2) : "0.00",
    };
  }

  function buildBoardKpiRow(bucket, keyName) {
    const counts = Dashboard.countNormalizedResults(
      bucket.board_results?.buckets || [],
      (result) => result.inspections?.value || 0
    );
    const total = counts.good + counts.pass + counts.fail;
    return {
      [keyName]: bucket.key,
      boards: boardCountFromBucket(bucket),
      good: counts.good,
      pass: counts.pass,
      fail: counts.fail,
      total,
      yield: total > 0 ? ((counts.good / total) * 100).toFixed(2) : "0.00",
    };
  }

  function mergePadAndBoardRows(padBuckets, boardBuckets, keyName) {
    const boardMap = Object.fromEntries(
      (boardBuckets || []).map((bucket) => [String(bucket.key), bucket])
    );
    const padMap = Object.fromEntries(
      (padBuckets || []).map((bucket) => [String(bucket.key), bucket])
    );
    const keys = new Set([...Object.keys(boardMap), ...Object.keys(padMap)]);

    return [...keys]
      .map((key) => {
        const padBucket = padMap[key];
        const boardBucket = boardMap[key];
        const pad = padCountsFromBucket(padBucket);
        return {
          [keyName]: key,
          boards: boardCountFromBucket(boardBucket || padBucket),
          ...pad,
        };
      })
      .sort((a, b) => b.boards - a.boards || b.total - a.total);
  }

  function renderKpiTable(theadId, tbodyId, firstLabel, rows, keyName) {
    const thead = document.getElementById(theadId);
    const tbody = document.getElementById(tbodyId);
    if (!thead || !tbody) return;

    const extraHeaders = isPadView
      ? "<th>Boards</th><th>Good</th><th>Fail</th><th>Pads</th><th>Pad Yield %</th>"
      : "<th>Boards</th><th>Good</th><th>Pass</th><th>Fail</th><th>Total</th><th>Yield %</th>";

    thead.innerHTML = `
      <tr>
        <th>${firstLabel}</th>
        ${extraHeaders}
      </tr>`;

    tbody.innerHTML = rows
      .map((row) =>
        isPadView
          ? `
          <tr>
            <td>${row[keyName]}</td>
            <td>${row.boards}</td>
            <td>${row.good}</td>
            <td>${row.fail}</td>
            <td>${row.total}</td>
            <td>${row.yield}</td>
          </tr>`
          : `
          <tr>
            <td>${row[keyName]}</td>
            <td>${row.boards}</td>
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
    let lineRows;
    let modelRows;

    if (isPadView) {
      const [padRes, boardRes] = await Promise.all([
        esClient.search({
          size: 0,
          query: esQueries.buildEsQuery(esQueries.buildEsFilters()),
          aggs: esQueries.buildPadAnalysisAggs(),
        }),
        esClient.searchBoard({
          size: 0,
          query: esQueries.buildEsQuery(esQueries.buildBoardFilters()),
          aggs: esQueries.buildBoardAnalysisAggs(),
        }),
      ]);

      lineRows = mergePadAndBoardRows(
        padRes.aggregations?.lines?.buckets,
        boardRes.aggregations?.lines?.buckets,
        "line"
      );
      modelRows = mergePadAndBoardRows(
        padRes.aggregations?.models?.buckets,
        boardRes.aggregations?.models?.buckets,
        "model"
      ).slice(0, 50);
    } else {
      const res = await esClient.searchBoard({
        size: 0,
        query: esQueries.buildEsQuery(esQueries.buildBoardFilters()),
        aggs: esQueries.buildBoardAnalysisAggs(),
      });

      lineRows = (res.aggregations?.lines?.buckets || [])
        .map((bucket) => buildBoardKpiRow(bucket, "line"))
        .sort((a, b) => b.boards - a.boards);
      modelRows = (res.aggregations?.models?.buckets || [])
        .map((bucket) => buildBoardKpiRow(bucket, "model"))
        .sort((a, b) => b.boards - a.boards)
        .slice(0, 50);
    }

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
      ? "Board count plus pad KPI by Line and Model"
      : "Board KPI breakdown by Line and Model";
  }
  document.title = isPadView ? "SPI Pad Analysis" : "SPI Analysis";

  document.getElementById("back-dashboard")?.addEventListener("click", () => {
    window.location.href = "index.html";
  });

  loadAnalysis().catch((error) => {
    ui?.showError?.(error?.message || "Failed to load analysis");
  });
})();
