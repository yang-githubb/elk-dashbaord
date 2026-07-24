/**
 * SMT Board Dashboard — main application entry.
 */
(function (D) {
  const { ui, esClient, esQueries, transform } = D;

  D.state = {
    time: D.config.defaultTimeRange || "all",
    line: "",
    model: "",
    view: "dashboard",
    selectedSerial: null,
    boardPage: 0,
    padPage: 0,
    boardTotalPages: 1,
    padTotalPages: 1,
    boardAfterStack: [null],
    loading: false,
    abort: null,
    padSearch: "",
    boardSearch: "",
    paretoVisible: true,
  };

  updatePadPanelVisibility();

  function updatePadPanelVisibility() {
    const hint = document.querySelector("#board-panel .panel-hint");
    if (hint) hint.textContent = D.getBoardHint();

    const detailHeading = document.querySelector("#pad-detail-heading");
    if (detailHeading) {
      detailHeading.innerHTML = `${D.getDetailTitle()} <span id="pad-serial-label" class="serial-label"></span>`;
    }

    const kpiDetailTitle = document.querySelector("#kpi-detail-section .section-title");
    if (kpiDetailTitle) kpiDetailTitle.textContent = `${D.getKpiDetailLabel()} KPIs`;

    const kpiDetailChart = document.querySelector("#kpi-detail-section .panel-head h3");
    if (kpiDetailChart) {
      kpiDetailChart.textContent = `${D.getKpiDetailLabel()} Result Distribution`;
    }

    if (!D.isPadLevel()) {
      ui.$("pad-panel")?.classList.add("hidden");
    }
  }


  function resetBoardPaging() {
    D.state.boardPage = 0;
    D.state.boardAfterStack = [null];
    D.state.boardTotalPages = 1;
  }

  function resetPadPaging() {
    D.state.padPage = 0;
    D.state.padTotalPages = 1;
  }

  async function loadFilters() {
    const fields = D.getFields();
    const filters = [];

    if (!esQueries.isAllTime()) {
      filters.push({ range: { [fields.time]: { gte: D.config.esTimeRanges[D.state.time] } } });
    }

    filters.push({
      term: {
        [D.esField(fields.station)]: "SPI"
      }
    });

    const res = await esClient.search({
      size: 0,
      query: esQueries.buildEsQuery(filters),
      aggs: {
        lines: { terms: { field: D.esField(fields.line), size: 200, order: { _key: "asc" } } },
        models: { terms: { field: D.esField(fields.model), size: 200, order: { _key: "asc" } } },
      },
    });

    ui.fillSelect(
      ui.$("time"),
      D.getTimeOrder().map((t) => ({ value: t, label: D.getTimeLabels()[t] || t })),
      (o) => o.label,
    );
    ui.$("time").value = D.state.time;

    const lines = res.aggregations?.lines?.buckets?.map((b) => String(b.key)) ?? [];
    const models = res.aggregations?.models?.buckets?.map((b) => String(b.key)) ?? [];

    ui.fillSelect(ui.$("line"), [{ value: "", label: "All lines" }, ...lines.map((l) => ({ value: l, label: l }))]);
    ui.fillSelect(ui.$("model"), [{ value: "", label: "All models" }, ...models.map((m) => ({ value: m, label: m }))]);
  }

  async function loadBoardList(signal) {

    const loadBoardStart = performance.now();

    const afterKey =
      D.state.boardAfterStack[
      D.state.boardPage
      ] ?? null;

    const esStart = performance.now();

    const res = await esClient.search(
      esQueries.buildBoardListAgg(afterKey),
      signal
    );

    console.log(
      "ES board search:",
      (performance.now() - esStart).toFixed(0),
      "ms"
    );

    const rows =
      (res.aggregations?.boards?.buckets ?? [])
        .map(transform.boardBucketToRow);

    const nextAfter =
      res.aggregations?.boards?.after_key;

    const hasNextPage = !!nextAfter;

    D.state.boardTotalPages =
      D.state.boardPage +
      (hasNextPage ? 2 : 1);

    if (
      nextAfter &&
      D.state.boardAfterStack.length ===
      D.state.boardPage + 1
    ) {
      D.state.boardAfterStack.push(
        nextAfter
      );
    }

    ui.renderBoardTable(
      rows,
      openPadView,
      D.isPadLevel()
    );

    ui.updateBoardPager();

    console.log(
      "loadBoardList:",
      (performance.now() - loadBoardStart).toFixed(0),
      "ms"
    );
  }

  async function loadPads(page, signal) {
    console.time("loadPads");
    if (!D.isPadLevel()) return;

    const fields = D.getFields();
    const serial = D.state.selectedSerial;

    if (!serial) return;

    const filters = esQueries.buildPadFilters(serial);

    const query = {
      bool: {
        filter: filters
      }
    };

    if (D.state.padSearch?.trim()) {

      const searchText = D.state.padSearch.trim();

      const padNo = Number(searchText);

      if (!isNaN(padNo)) {
        query.bool.filter.push({
          term: {
            pad_no: padNo
          }
        });
      }
    }

    const res = await esClient.search(
      {
        from: page * D.config.pageSize,
        size: D.config.pageSize,
        track_total_hits: true,

        sort: D.getDetailSort() || [
          { [fields.time]: { order: "desc" } },
          { pad_no: { order: "asc" } }
        ],

        query,

        _source: D.getPadSourceFields()
      },
      signal
    );

    const total =
      typeof res.hits.total === "number"
        ? res.hits.total
        : (res.hits.total?.value ?? 0);

    D.state.padTotalPages = Math.max(
      1,
      Math.ceil(total / D.config.pageSize)
    );

    D.state.padPage = page;

    ui.renderPadTable(
      res.hits.hits.map(transform.hitToPadRow)
    );

    ui.updatePadPager();
    console.timeEnd("loadPads");
  }

  async function loadDashboard(silent = false) {

    if (!silent) {
      ui.setLoading(true);
    }

    ui.hideError();

    if (!D.isPadLevel()) {
      ui.$("pad-panel")?.classList.add("hidden");
      D.state.view = "dashboard";
      D.state.selectedSerial = null;
    }

    D.state.abort?.abort();

    const controller = new AbortController();
    D.state.abort = controller;

    try {

      const query = esQueries.buildEsQuery(
        esQueries.buildEsFilters()
      );

      const aggPromise = esClient.search(
        {
          size: 0,
          query,
          aggs: esQueries.buildDashboardAggs()
        },
        controller.signal
      );

      const aggRes = await aggPromise;

      const failureCounts =
        (
          aggRes.aggregations
            ?.pad_failure_types
            ?.types
            ?.buckets || []
        )
          .reduce((acc, bucket) => {

            acc[bucket.key] =
              bucket.doc_count;

            return acc;

          }, {});

      if (controller.signal.aborted) {
        return;
      }

      ui.applyKpis(
        aggRes,
        failureCounts
      );

      const isPadView =
        D.isPadLevel() &&
        D.state.view === "pads" &&
        D.state.selectedSerial;

      if (isPadView) {

        await loadPads(
          D.state.padPage,
          controller.signal
        );

      } else {

        await loadBoardList(
          controller.signal
        );
      }

      ui.setStatus(true);

    } catch (err) {

      if (controller.signal.aborted) {
        return;
      }

      ui.setStatus(false);

      ui.showError(
        err?.message ||
        "Failed to load data"
      );

    } finally {

      if (!controller.signal.aborted) {

        ui.setLoading(false);

        ui.updateBoardPager();

        ui.updatePadPager();
      }
    }
  }

  async function loadAnalysis() {

    ui.setLoading(true);

    try {

      const query = esQueries.buildEsQuery(
        esQueries.buildEsFilters()
      );

      const res = await esClient.search({
        size: 0,
        query,
        aggs: esQueries.buildBoardAnalysisAggs()
      });

      const lineRows =
        (res.aggregations?.lines?.buckets || [])
          .map(bucket => {

            let good = 0;
            let pass = 0;
            let fail = 0;

            for (const result of bucket.board_results?.buckets || []) {

              const count =
                result.inspections?.value || 0;

              if (result.key === "GOOD") {
                good += count;
              }
              else if (
                result.key === "PASS" ||
                result.key === "WARNING"
              ) {
                pass += count;
              }
              else if (result.key === "NG") {
                fail += count;
              }
            }

            const total =
              good + pass + fail;

            return {
              line: bucket.key,
              good,
              pass,
              fail,
              total,
              yield:
                total > 0
                  ? ((good / total) * 100).toFixed(2)
                  : "0.00"
            };
          });

      console.log("LINE ROWS", lineRows);


      const modelRows =
        (res.aggregations?.models?.buckets || [])
          .map(bucket => {

            let good = 0;
            let pass = 0;
            let fail = 0;

            for (const result of bucket.board_results?.buckets || []) {

              const count =
                result.inspections?.value || 0;

              if (result.key === "GOOD") {
                good += count;
              }
              else if (
                result.key === "PASS" ||
                result.key === "WARNING"
              ) {
                pass += count;
              }
              else if (result.key === "NG") {
                fail += count;
              }
            }

            const total =
              good + pass + fail;

            return {
              model: bucket.key,
              good,
              pass,
              fail,
              total,
              yield:
                total > 0
                  ? ((good / total) * 100).toFixed(2)
                  : "0.00"
            };
          });

      console.log("MODEL ROWS", modelRows);

    } catch (err) {

      ui.showError(
        err?.message ||
        "Failed to load analysis"
      );

    } finally {

      ui.setLoading(false);

    }
  }

  async function checkHealth() {
    if (esClient.usesProxy()) {
      try {
        const res = await fetch(`${esClient.proxyBaseUrl()}/search`, { method: "OPTIONS" });
        ui.setStatus(res.ok || res.status === 204);
      } catch {
        ui.setStatus(false);
      }
      return;
    }

    try {
      const { node, username, password } = D.config;
      const res = await fetch(node.replace(/\/$/, ""), {
        headers: { Authorization: "Basic " + btoa(`${username}:${password}`) },
      });
      ui.setStatus(res.ok);
    } catch {
      ui.setStatus(false);
    }
  }

  function openPadView(serial) {
    if (!serial || serial === "—" || !D.isPadLevel()) return;

    D.state.padSearch = "";

    if (ui.$("pad-search")) {
      ui.$("pad-search").value = "";
    }

    ui.showPadView(serial);
    resetPadPaging();
    loadDashboard();
  }

  async function exportCurrentBoard() {

    const serial = D.state.selectedSerial;

    if (!serial) {
      alert("Please select a board first.");
      return;
    }

    const res = await esClient.search(
      {
        size: 10000,
        sort: [
          {
            pad_no: {
              order: "asc"
            }
          }
        ],
        query: esQueries.buildEsQuery(
          esQueries.buildPadFilters(serial)
        ),
        _source: D.getPadSourceFields()
      }
    );

    const rows = res.hits.hits.map(hit => hit._source);

    const worksheet = XLSX.utils.json_to_sheet(rows);

    const workbook = XLSX.utils.book_new();

    XLSX.utils.book_append_sheet(
      workbook,
      worksheet,
      "Board Details"
    );

    XLSX.writeFile(
      workbook,
      `${serial}.xlsx`
    );
  }

  async function exportBoardList() {
    console.log("exportBoardList clicked");
    const startTime = performance.now();
    try {
      const columns = D.getBoardColumns();
      const fields = D.getFields();
      console.log("Board columns:", columns.length, columns.map(c => c.key).join(", "));
      const rows = [];
      const originalTimeout = D.config.fetchTimeoutMs;
      const originalPageSize = D.config.pageSize;
      D.config.fetchTimeoutMs = 120_000; // 2 minutes for export
      D.config.pageSize = 5000; // Large batch size for export
      let pageCount = 0;

      const fetchStartTime = performance.now();
      try {
        while (true) {
          pageCount++;
          console.log(`[Export] Fetching page ${pageCount} (optimized query)...`);
          const agg = esQueries.buildBoardListExportAgg(); // Use optimized export query
          const res = await esClient.search(agg);
          const buckets = res.aggregations?.boards?.buckets ?? [];
          console.log(`[Export] Page ${pageCount}: got ${buckets.length} boards`);

          // Extract data from top_hits documents instead of aggregation sub-buckets
          buckets.forEach((bucket) => {
            const hit = bucket.latest_doc?.hits?.hits?.[0];
            if (hit?._source) {
              const source = hit._source;
              const row = {};

              // Build row with values from source document for each column
              for (const col of columns) {
                const fieldKey = col.key;
                // Try the field key directly, then try common variants
                let value = source[fieldKey] ||
                  source[fields[fieldKey]] ||
                  (fieldKey === "serial" ? bucket.key : null) ||
                  "—";
                row[fieldKey] = value;
              }
              rows.push(row);
            }
          });

          console.log(`[Export] Total rows so far: ${rows.length}`);
          // For terms aggregation, pagination happens via bucket offset, not after_key
          // If we got fewer than pageSize results, we've reached the end
          if (buckets.length < D.config.pageSize) break;
        }
      } finally {
        D.config.fetchTimeoutMs = originalTimeout; // restore original timeout
        D.config.pageSize = originalPageSize; // restore original page size
      }
      const fetchTime = performance.now() - fetchStartTime;
      console.log(`[Export] Data fetching complete in ${(fetchTime / 1000).toFixed(2)}s. Total rows: ${rows.length}`);

      if (!rows.length) {
        alert("No board data available for export.");
        return;
      }

      console.log("[Export] Building payload...");
      const payloadStartTime = performance.now();
      const payload = rows.map((row) => {
        const item = {};
        for (const col of columns) {
          const label = col.label || col.key;
          item[label] = row[col.key];
        }
        return item;
      });
      const payloadTime = performance.now() - payloadStartTime;
      console.log(`[Export] Payload built in ${(payloadTime / 1000).toFixed(2)}s: ${payload.length} rows`);

      console.log("[Export] Creating XLSX worksheet...");
      const xlsxStartTime = performance.now();
      const worksheet = XLSX.utils.json_to_sheet(payload);
      console.log("[Export] Creating workbook...");
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "Boards");
      const date = new Date().toISOString().slice(0, 10);
      const filename = `boards-${date}.xlsx`;
      const xlsxTime = performance.now() - xlsxStartTime;
      console.log(`[Export] Workbook created in ${(xlsxTime / 1000).toFixed(2)}s. File: ${filename}, rows: ${payload.length}, cols: ${columns.length}`);

      console.log("XLSX object", typeof XLSX, XLSX);
      console.log("Export payload rows", payload.length, "columns", columns.length);

      try {
        if (typeof XLSX.writeFile === "function") {
          console.log("[Export] Using XLSX.writeFile...");
          const downloadStartTime = performance.now();
          XLSX.writeFile(workbook, filename);
          const downloadTime = performance.now() - downloadStartTime;
          console.log(`[Export] File download initiated in ${(downloadTime / 1000).toFixed(2)}s`);
        } else {
          throw new Error("XLSX.writeFile is not a function");
        }
      } catch (err) {
        console.warn("XLSX.writeFile failed, falling back to manual download", err);
        console.log("[Export] Using manual blob download...");
        const downloadStartTime = performance.now();
        const data = XLSX.write(workbook, { bookType: "xlsx", type: "array" });
        const blob = new Blob([data], { type: "application/octet-stream" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
        const downloadTime = performance.now() - downloadStartTime;
        console.log(`[Export] Manual download completed in ${(downloadTime / 1000).toFixed(2)}s`);
      }

      const totalTime = performance.now() - startTime;
      console.log(`[Export] ✅ TOTAL TIME: ${(totalTime / 1000).toFixed(2)}s`);
    } catch (err) {
      const totalTime = performance.now() - startTime;
      console.error("exportBoardList failed", err);
      console.error("Error stack:", err?.stack);
      const errorMsg = err?.message || "unknown error";
      console.error("Error details:", { name: err?.name, message: errorMsg, timeout: D.config.fetchTimeoutMs });
      console.error(`[Export] ❌ FAILED after ${(totalTime / 1000).toFixed(2)}s`);
      alert("Board export failed: " + errorMsg);
    }
  }

  function backToBoards() {
    D.state.selectedSerial = null;
    resetPadPaging();
    ui.showBoardView();
    loadDashboard();
  }

  function openAnalysisView() {

    D.state.view = "analysis";

    ui.$("analysis-panel")
      ?.classList.remove("hidden");

    ui.$("board-panel")
      ?.classList.add("hidden");

    ui.$("pad-panel")
      ?.classList.add("hidden");

    loadAnalysis();
  }

  function backToDashboard() {

    D.state.view = "dashboard";

    ui.$("analysis-panel")
      ?.classList.add("hidden");

    ui.$("board-panel")
      ?.classList.remove("hidden");

    if (D.isPadLevel()) {
      ui.$("pad-panel")
        ?.classList.add("hidden");
    }

    loadDashboard();
  }

  function onFilterChange() {
    D.state.time = ui.$("time").value;
    D.state.line = ui.$("line").value;
    D.state.model = ui.$("model").value;

    D.state.selectedSerial = null;

    resetBoardPaging();
    resetPadPaging();

    ui.showBoardView();

    loadDashboard();
  }

  ui.$("time").addEventListener("change", onFilterChange);
  ui.$("line").addEventListener("change", onFilterChange);
  ui.$("model").addEventListener("change", onFilterChange);
  ui.$("refresh").addEventListener("click", () => loadDashboard());
  ui.$("retry").addEventListener("click", () => loadDashboard());
  ui.$("back-boards").addEventListener("click", backToBoards);

  let padSearchTimer;

  ui.$("pad-search")?.addEventListener(
    "input",
    () => {

      clearTimeout(padSearchTimer);

      padSearchTimer = setTimeout(() => {

        D.state.padSearch =
          ui.$("pad-search").value.trim();

        D.state.padPage = 0;

        loadPads(
          0,
          D.state.abort?.signal
        );

      }, 300);
    }
  );

  let boardSearchTimer;

  ui.$("board-search")?.addEventListener(
    "input",
    () => {

      clearTimeout(boardSearchTimer);

      boardSearchTimer = setTimeout(() => {

        D.state.boardSearch =
          ui.$("board-search").value.trim();

        resetBoardPaging();

        loadDashboard();

      }, 300);
    }
  );

  ui.$("export-board").addEventListener(
    "click",
    exportCurrentBoard
  );

  ui.$("export-boards").addEventListener(
    "click",
    exportBoardList
  );

  ui.$("board-prev").addEventListener(
    "click",
    async () => {

      if (D.state.boardPage > 0) {

        D.state.boardPage--;

        await loadBoardList(
          D.state.abort?.signal
        );
      }
    }
  );

  ui.$("board-next").addEventListener(
    "click",
    async () => {

      if (
        D.state.boardPage + 1 <
        D.state.boardTotalPages
      ) {

        D.state.boardPage++;

        await loadBoardList(
          D.state.abort?.signal
        );
      }
    }
  );

  ui.$("pad-prev").addEventListener(
    "click",
    async () => {

      if (D.state.padPage > 0) {

        D.state.padPage--;

        await loadPads(
          D.state.padPage,
          D.state.abort?.signal
        );
      }
    }
  );

  ui.$("pad-next").addEventListener(
    "click",
    async () => {

      if (
        D.state.padPage + 1 <
        D.state.padTotalPages
      ) {

        D.state.padPage++;

        await loadPads(
          D.state.padPage,
          D.state.abort?.signal
        );
      }
    }
  );

  ui.$("chart-board")?.addEventListener(
    "click",
    () => {

      const params = new URLSearchParams({
        time: D.state.time,
        line: D.state.line,
        model: D.state.model
      });

      window.location.href =
        `analysis.html?${params.toString()}`;
    }
  );

  setInterval(() => loadDashboard(true), D.config.refreshMs);
  setInterval(checkHealth, D.config.healthMs);

  loadFilters()
    .then(() => loadDashboard())
    .catch((err) => ui.showError(err.message || "Failed to load"));

  checkHealth();
})(window.Dashboard);
