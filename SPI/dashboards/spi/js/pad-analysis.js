/**
 * SPI pad failure analysis — counts by line and model × line.
 * Failure type comes from the Pareto chart (?failure=EXCESSIVE_VOLUME).
 */
(function () {
  const Dashboard = window.Dashboard;
  const { esClient, esQueries } = Dashboard;

  const params = new URLSearchParams(window.location.search);
  const filterState = {
    time: params.get("time") || "all",
    line: params.get("line") || "",
    model: params.get("model") || "",
    failure: params.get("failure") || "",
  };

  Dashboard.state = {
    time: filterState.time,
    line: filterState.line,
    model: filterState.model,
  };

  function buildQuery() {
    const filters = [...esQueries.buildEsFilters()];
    if (filterState.failure) {
      filters.push({
        term: { [esQueries.padResultField()]: filterState.failure },
      });
    }
    return esQueries.buildEsQuery(filters);
  }

  function buildAggregations() {
    const fields = Dashboard.getFields();
    const lineField = Dashboard.esField(fields.line);
    const modelField = Dashboard.esField(fields.model);

    return {
      lines: { terms: { field: lineField, size: 100 } },
      models: {
        terms: { field: modelField, size: 100, order: { _count: "desc" } },
        aggs: {
          lines: { terms: { field: lineField, size: 20 } },
        },
      },
    };
  }

  function renderCountTable(theadId, tbodyId, firstColumnTitle, buckets) {
    const thead = document.getElementById(theadId);
    const tbody = document.getElementById(tbodyId);
    if (!thead || !tbody) return;

    thead.innerHTML = `
      <tr>
        <th>${firstColumnTitle}</th>
        <th>Count</th>
      </tr>`;

    tbody.innerHTML = buckets
      .map(
        (bucket) => `
          <tr>
            <td>${bucket.key}</td>
            <td>${bucket.doc_count.toLocaleString()}</td>
          </tr>`
      )
      .join("");
  }

  function renderModelLineMatrix(modelBuckets) {
    const thead = document.getElementById("model-failure-thead");
    const tbody = document.getElementById("model-failure-tbody");
    if (!thead || !tbody) return;

    const allLines = [
      ...new Set(
        modelBuckets.flatMap((model) =>
          (model.lines?.buckets || []).map((line) => line.key)
        )
      ),
    ].sort();

    thead.innerHTML = `
      <tr>
        <th>Model</th>
        ${allLines.map((line) => `<th>${line}</th>`).join("")}
        <th>Total</th>
      </tr>`;

    tbody.innerHTML = modelBuckets
      .map((model) => {
        const lineMap = {};
        for (const line of model.lines?.buckets || []) {
          lineMap[line.key] = line.doc_count;
        }
        const cells = allLines
          .map(
            (line) =>
              `<td>${(lineMap[line] || 0).toLocaleString()}</td>`
          )
          .join("");

        return `
          <tr>
            <td>${model.key}</td>
            ${cells}
            <td>${model.doc_count.toLocaleString()}</td>
          </tr>`;
      })
      .join("");
  }

  async function loadAnalysis() {
    const response = await esClient.search({
      size: 0,
      query: buildQuery(),
      aggs: buildAggregations(),
    });

    renderCountTable(
      "line-failure-thead",
      "line-failure-tbody",
      "Line",
      response.aggregations?.lines?.buckets || []
    );
    renderModelLineMatrix(response.aggregations?.models?.buckets || []);
  }

  const title = document.getElementById("failure-title");
  if (title) {
    title.textContent = filterState.failure
      ? `Failure Analysis - ${filterState.failure}`
      : "Pad Failure Analysis";
  }

  document.getElementById("back-dashboard")?.addEventListener("click", () => {
    window.location.href = "index.html";
  });

  loadAnalysis().catch((error) => {
    console.error("Failure analysis failed", error);
  });
})();
