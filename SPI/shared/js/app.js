/**
 * Dashboard controller: filters, KPIs, board/pad tables, export.
 *
 * Dual-index dashboards (SPI):
 *   board KPI + board list → /search-board (spi-board)
 *   pad KPI  + pad table   → /search      (jax optimizations)
 *
 * Single-index dashboards (MagicRay): both KPIs use /search.
 */
(function (D) {
  const { ui, esClient, esQueries, transform } = D;

  const SEARCH_DEBOUNCE_MS = 300;
  const EXPORT_TIMEOUT_MS = 120_000;
  const EXPORT_PAGE_SIZE = 1000;
  const PAD_EXPORT_SIZE = 10_000;

  D.state = {
    time: D.config?.defaultTimeRange || "all",
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
    inFlight: false,
    abort: null,
    padSearch: "",
    boardSearch: "",
  };

  applySchemaLabels();

  // ---- Helpers ---------------------------------------------------------

  function applySchemaLabels() {
    const hint = document.querySelector("#board-panel .panel-hint");
    if (hint) hint.textContent = D.getBoardHint();

    const detailHeading = document.querySelector("#pad-detail-heading");
    if (detailHeading) {
      detailHeading.innerHTML =
        `${D.getDetailTitle()} <span id="pad-serial-label" class="serial-label"></span>`;
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

  function debounce(fn, waitMs) {
    let timer;
    return (...args) => {
      clearTimeout(timer);
      timer = setTimeout(() => fn(...args), waitMs);
    };
  }

  function hitTotal(res) {
    const total = res.hits?.total;
    return typeof total === "number" ? total : (total?.value ?? 0);
  }

  // ---- Data loading ----------------------------------------------------

  async function loadFilters() {
    const timeSelect = ui.$("time");
    ui.fillSelect(
      timeSelect,
      D.getTimeOrder().map((t) => ({
        value: t,
        label: D.getTimeLabels()[t] || t,
      })),
      (option) => option.label
    );
    if (timeSelect) timeSelect.value = D.state.time;

    const dual = D.getIndexMode() === "dual";
    const fields = dual ? D.getBoardFields() : D.getFields();
    const filters = [];

    if (dual) {
      esQueries.pushTimeFilter(filters, fields.time);
      esQueries.pushTerm(
        filters,
        D.esBoardField(fields.station) || "station",
        D.config.stationValue || "SPI"
      );
    } else {
      esQueries.pushTimeFilter(filters, fields.time);
      esQueries.pushTerm(
        filters,
        D.esField(fields.station),
        D.config.stationValue || "SPI"
      );
    }

    const lineField = dual
      ? D.esBoardField(fields.line)
      : D.esField(fields.line);
    const modelField = dual
      ? D.esBoardField(fields.model)
      : D.esField(fields.model);

    const searchFn = dual ? esClient.searchBoard : esClient.search;
    const res = await searchFn({
      size: 0,
      track_total_hits: false,
      query: esQueries.buildEsQuery(filters),
      aggs: {
        lines: lineField
          ? { terms: { field: lineField, size: 200, order: { _key: "asc" } } }
          : { terms: { field: "_id", size: 0 } },
        models: modelField
          ? { terms: { field: modelField, size: 200, order: { _key: "asc" } } }
          : { terms: { field: "_id", size: 0 } },
      },
    });

    const lines = res.aggregations?.lines?.buckets?.map((b) => String(b.key)) ?? [];
    const models = res.aggregations?.models?.buckets?.map((b) => String(b.key)) ?? [];

    ui.fillSelect(ui.$("line"), [
      { value: "", label: "All lines" },
      ...lines.map((line) => ({ value: line, label: line })),
    ]);
    ui.fillSelect(ui.$("model"), [
      { value: "", label: "All models" },
      ...models.map((model) => ({ value: model, label: model })),
    ]);
  }

  function kpiSearchBody(query, aggs) {
    return {
      size: 0,
      track_total_hits: false,
      query,
      aggs,
    };
  }

  async function loadBoardKpis(signal) {
    return esClient.searchBoard(
      kpiSearchBody(
        esQueries.buildEsQuery(esQueries.buildBoardFilters()),
        esQueries.buildBoardDashboardAggs()
      ),
      signal
    );
  }

  async function loadPadKpis(signal) {
    return esClient.search(
      kpiSearchBody(
        esQueries.buildEsQuery(esQueries.buildEsFilters({ skipSerialSearch: true })),
        esQueries.buildPadDashboardAggs()
      ),
      signal
    );
  }

  async function loadBoardList(signal) {
    const afterKey = D.state.boardAfterStack[D.state.boardPage] ?? null;
    const res = await esClient.searchBoard(
      esQueries.buildBoardListAgg(afterKey),
      signal
    );

    const buckets = res.aggregations?.boards?.buckets ?? [];
    const nextAfter = res.aggregations?.boards?.after_key;
    D.state.boardTotalPages = D.state.boardPage + (nextAfter ? 2 : 1);

    if (nextAfter && D.state.boardAfterStack.length === D.state.boardPage + 1) {
      D.state.boardAfterStack.push(nextAfter);
    }

    ui.renderBoardTable(
      buckets.map(transform.boardBucketToRow),
      openPadView,
      D.isPadLevel()
    );
    ui.updateBoardPager();
  }

  async function loadPads(page, signal) {
    if (!D.isPadLevel() || !D.state.selectedSerial) return;

    const fields = D.getFields();
    const query = {
      bool: { filter: esQueries.buildPadFilters(D.state.selectedSerial) },
    };

    const padSearch = D.state.padSearch?.trim();
    if (padSearch) {
      const padNo = Number(padSearch);
      if (!Number.isNaN(padNo)) {
        query.bool.filter.push({ term: { [esQueries.padNoField()]: padNo } });
      }
    }

    const res = await esClient.search(
      {
        from: page * D.config.pageSize,
        size: D.config.pageSize,
        track_total_hits: true,
        sort: D.getDetailSort() || [
          { [fields.time]: { order: "desc" } },
          { [esQueries.padNoField()]: { order: "asc" } },
        ],
        query,
        _source: D.getPadSourceFields(),
      },
      signal
    );

    D.state.padTotalPages = Math.max(
      1,
      Math.ceil(hitTotal(res) / D.config.pageSize)
    );
    D.state.padPage = page;
    ui.renderPadTable(res.hits.hits.map(transform.hitToPadRow));
    ui.updatePadPager();
  }

  async function loadDashboard(silent = false) {
    if (silent && D.state.inFlight) return;

    if (!silent) ui.setLoading(true);
    ui.hideError();

    if (!D.isPadLevel()) {
      ui.$("pad-panel")?.classList.add("hidden");
      D.state.view = "dashboard";
      D.state.selectedSerial = null;
    }

    D.state.abort?.abort();
    const controller = new AbortController();
    D.state.abort = controller;
    D.state.inFlight = true;

    try {
      const showingPads =
        D.isPadLevel() &&
        D.state.view === "pads" &&
        D.state.selectedSerial;

      if (D.getIndexMode() === "dual") {
        const padKpiPromise = loadPadKpis(controller.signal);
        const boardAggRes = await loadBoardKpis(controller.signal);
        if (controller.signal.aborted) return;

        ui.applyBoardKpis(boardAggRes);
        if (!silent) ui.setPadKpisLoading();

        if (showingPads) {
          await loadPads(D.state.padPage, controller.signal);
        } else if (D.hasFeature("boardList")) {
          await loadBoardList(controller.signal);
        }

        ui.setStatus(true);
        ui.setLoading(false);

        try {
          const padAggRes = await padKpiPromise;
          if (controller.signal.aborted) return;
          ui.applyPadKpis(padAggRes);
        } catch (padErr) {
          if (!controller.signal.aborted) {
            ui.applyPadKpisError(padErr?.message || "Pad KPI query timed out");
          }
        }
      } else {
        const res = await esClient.search(
          kpiSearchBody(
            esQueries.buildEsQuery(esQueries.buildEsFilters({ skipSerialSearch: true })),
            {
              ...esQueries.buildBoardDashboardAggs(),
              ...esQueries.buildPadDashboardAggs(),
            }
          ),
          controller.signal
        );
        if (controller.signal.aborted) return;

        ui.applyBoardKpis(res);
        ui.applyPadKpis(res);

        if (showingPads) {
          await loadPads(D.state.padPage, controller.signal);
        } else if (D.hasFeature("boardList")) {
          await loadBoardList(controller.signal);
        }

        ui.setStatus(true);
      }
    } catch (err) {
      if (controller.signal.aborted) return;
      ui.setStatus(false);
      ui.showError(err?.message || "Failed to load data");
    } finally {
      if (D.state.abort === controller) {
        D.state.inFlight = false;
        if (!controller.signal.aborted) {
          ui.setLoading(false);
          ui.updateBoardPager();
          ui.updatePadPager();
        }
      }
    }
  }

  async function checkHealth() {
    try {
      if (esClient.usesProxy()) {
        const res = await fetch(`${esClient.proxyBaseUrl()}/search`, {
          method: "OPTIONS",
        });
        ui.setStatus(res.ok || res.status === 204);
        return;
      }

      const { node, username, password } = D.config;
      const res = await fetch(node.replace(/\/$/, ""), {
        headers: { Authorization: "Basic " + btoa(`${username}:${password}`) },
      });
      ui.setStatus(res.ok);
    } catch {
      ui.setStatus(false);
    }
  }

  // ---- Export ----------------------------------------------------------

  function downloadWorkbook(workbook, filename) {
    if (typeof XLSX.writeFile === "function") {
      XLSX.writeFile(workbook, filename);
      return;
    }

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
  }

  async function exportCurrentBoard() {
    const serial = D.state.selectedSerial;
    if (!serial) {
      alert("Please select a board first.");
      return;
    }

    const res = await esClient.search({
      size: PAD_EXPORT_SIZE,
      sort: [{ [esQueries.padNoField()]: { order: "asc" } }],
      query: esQueries.buildEsQuery(esQueries.buildPadFilters(serial)),
      _source: D.getPadSourceFields(),
    });

    const rows = res.hits.hits.map((hit) => hit._source);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(
      workbook,
      XLSX.utils.json_to_sheet(rows),
      "Board Details"
    );
    XLSX.writeFile(workbook, `${serial}.xlsx`);
  }

  async function exportBoardList() {
    const columns = D.getBoardColumns();
    const originalTimeout = D.config.fetchTimeoutMs;
    const originalPageSize = D.config.pageSize;
    const rows = [];

    D.config.fetchTimeoutMs = EXPORT_TIMEOUT_MS;
    D.config.pageSize = EXPORT_PAGE_SIZE;

    try {
      let afterKey = null;
      while (true) {
        const res = await esClient.searchBoard(
          esQueries.buildBoardListAgg(afterKey)
        );
        const buckets = res.aggregations?.boards?.buckets ?? [];
        for (const bucket of buckets) {
          rows.push(transform.boardBucketToRow(bucket));
        }
        afterKey = res.aggregations?.boards?.after_key;
        if (!afterKey) break;
      }
    } catch (err) {
      alert("Board export failed: " + (err?.message || "unknown error"));
      return;
    } finally {
      D.config.fetchTimeoutMs = originalTimeout;
      D.config.pageSize = originalPageSize;
    }

    if (!rows.length) {
      alert("No board data available for export.");
      return;
    }

    const payload = rows.map((row) => {
      const item = {};
      for (const col of columns) {
        item[col.label || col.key] = row[col.key];
      }
      return item;
    });

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(
      workbook,
      XLSX.utils.json_to_sheet(payload),
      "Boards"
    );
    downloadWorkbook(
      workbook,
      `boards-${new Date().toISOString().slice(0, 10)}.xlsx`
    );
  }

  // ---- Navigation ------------------------------------------------------

  function openPadView(serial) {
    if (!serial || serial === "—" || !D.isPadLevel()) return;

    D.state.padSearch = "";
    const padSearchInput = ui.$("pad-search");
    if (padSearchInput) padSearchInput.value = "";

    ui.showPadView(serial);
    resetPadPaging();
    loadDashboard();
  }

  function backToBoards() {
    D.state.selectedSerial = null;
    resetPadPaging();
    ui.showBoardView();
    loadDashboard();
  }

  function onFilterChange() {
    D.state.time = ui.$("time")?.value ?? D.state.time;
    D.state.line = ui.$("line")?.value ?? D.state.line;
    D.state.model = ui.$("model")?.value ?? D.state.model;
    D.state.selectedSerial = null;
    resetBoardPaging();
    resetPadPaging();
    ui.showBoardView();
    loadDashboard();
  }

  function openAnalysisPage() {
    const params = new URLSearchParams({
      time: D.state.time,
      line: D.state.line,
      model: D.state.model,
    });
    window.location.href = `${D.pageUrl("analysis")}?${params.toString()}`;
  }

  // ---- Events ----------------------------------------------------------

  ui.$("time")?.addEventListener("change", onFilterChange);
  ui.$("line")?.addEventListener("change", onFilterChange);
  ui.$("model")?.addEventListener("change", onFilterChange);
  ui.$("refresh")?.addEventListener("click", () => loadDashboard());
  ui.$("retry")?.addEventListener("click", () => loadDashboard());
  ui.$("back-boards")?.addEventListener("click", backToBoards);
  ui.$("export-board")?.addEventListener("click", exportCurrentBoard);
  ui.$("export-boards")?.addEventListener("click", exportBoardList);
  ui.$("chart-board")?.addEventListener("click", openAnalysisPage);

  ui.$("pad-search")?.addEventListener(
    "input",
    debounce(() => {
      D.state.padSearch = ui.$("pad-search")?.value.trim() || "";
      D.state.padPage = 0;
      loadPads(0, D.state.abort?.signal);
    }, SEARCH_DEBOUNCE_MS)
  );

  ui.$("board-search")?.addEventListener(
    "input",
    debounce(() => {
      D.state.boardSearch = ui.$("board-search")?.value.trim() || "";
      resetBoardPaging();
      loadDashboard();
    }, SEARCH_DEBOUNCE_MS)
  );

  ui.$("board-prev")?.addEventListener("click", async () => {
    if (D.state.boardPage > 0) {
      D.state.boardPage -= 1;
      await loadBoardList(D.state.abort?.signal);
    }
  });

  ui.$("board-next")?.addEventListener("click", async () => {
    if (D.state.boardPage + 1 < D.state.boardTotalPages) {
      D.state.boardPage += 1;
      await loadBoardList(D.state.abort?.signal);
    }
  });

  ui.$("pad-prev")?.addEventListener("click", async () => {
    if (D.state.padPage > 0) {
      D.state.padPage -= 1;
      await loadPads(D.state.padPage, D.state.abort?.signal);
    }
  });

  ui.$("pad-next")?.addEventListener("click", async () => {
    if (D.state.padPage + 1 < D.state.padTotalPages) {
      D.state.padPage += 1;
      await loadPads(D.state.padPage, D.state.abort?.signal);
    }
  });

  setInterval(() => loadDashboard(true), D.config.refreshMs);
  setInterval(checkHealth, D.config.healthMs);

  loadFilters()
    .then(() => loadDashboard())
    .catch((err) => ui.showError(err.message || "Failed to load"));

  checkHealth();
})(window.Dashboard);
