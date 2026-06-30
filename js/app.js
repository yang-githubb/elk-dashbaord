/**
 * SMT Board Dashboard — main application entry.
 */
(function (D) {
  const { ui, esClient, esQueries, transform } = D;

  D.state = {
    time: D.config.defaultTimeRange || "all",
    line: "",
    model: "",
    station: D.config.defaultStation || "SPI",
    view: "boards",
    selectedSerial: null,
    boardPage: 0,
    padPage: 0,
    boardTotalPages: 1,
    padTotalPages: 1,
    boardAfterStack: [null],
    loading: false,
    abort: null,
  };

  D.applyStationSchema(D.state.station);
  ui.$("station").value = D.state.station;
  updatePadPanelVisibility();

  let boardKpiCache = null;
  let boardKpiTs = 0;

  function updatePadPanelVisibility() {
    const hint = document.querySelector("#board-panel .panel-hint");
    if (hint) {
      hint.textContent = D.isPadLevel()
        ? "Click a serial to view pad inspection data"
        : "AOI — board list only (no pad drill-down)";
    }
    if (!D.isPadLevel()) {
      ui.$("pad-panel")?.classList.add("hidden");
    }
  }

  function invalidateBoardCache() {
    boardKpiCache = null;
    boardKpiTs = 0;
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

  async function computeBoardKpi(signal) {
    const now = Date.now();
    if (boardKpiCache && now - boardKpiTs < D.config.boardCacheMs) {
      return boardKpiCache;
    }

    let afterKey = null;
    let boardPass = 0;
    let boardFail = 0;
    let boardCount = 0;

    while (true) {
      const res = await esClient.search(esQueries.buildBoardKpiAgg(afterKey), signal);
      const buckets = res.aggregations?.boards?.buckets ?? [];
      if (!buckets.length) break;

      for (const b of buckets) {
        boardCount++;
        if (b.has_ng.doc_count > 0) boardFail++;
        else boardPass++;
      }

      afterKey = res.aggregations.boards.after_key;
      if (!afterKey) break;
    }

    boardKpiCache = {
      boardCount,
      boardPass,
      boardFail,
      boardYield: boardCount ? (boardPass / boardCount) * 100 : 0,
    };
    boardKpiTs = now;
    return boardKpiCache;
  }

  async function loadFilters() {
    const fields = D.getFields();
    const filters = [];

    if (!esQueries.isAllTime()) {
      filters.push({ range: { [fields.time]: { gte: D.config.esTimeRanges[D.state.time] } } });
    }
    filters.push({ term: { [D.esField(fields.station)]: D.state.station } });

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

    D.applyProfileBanner();
  }

  async function loadBoardList(signal) {
    const afterKey = D.state.boardAfterStack[D.state.boardPage] ?? null;
    const res = await esClient.search(esQueries.buildBoardListAgg(afterKey), signal);
    const rows = (res.aggregations?.boards?.buckets ?? []).map(transform.boardBucketToRow);

    const boardKpi = boardKpiCache ?? (await computeBoardKpi(signal));
    D.state.boardTotalPages = Math.max(1, Math.ceil(boardKpi.boardCount / D.config.pageSize));

    const nextAfter = res.aggregations?.boards?.after_key;
    if (nextAfter && D.state.boardAfterStack.length === D.state.boardPage + 1) {
      D.state.boardAfterStack.push(nextAfter);
    }

    ui.renderBoardTable(rows, openPadView, D.isPadLevel());
    ui.updateBoardPager();
    return boardKpi;
  }

  async function loadPads(page, signal) {
    if (!D.isPadLevel()) return;

    const fields = D.getFields();
    const serial = D.state.selectedSerial;
    if (!serial) return;

    const res = await esClient.search(
      {
        from: page * D.config.pageSize,
        size: D.config.pageSize,
        track_total_hits: true,
        sort: [{ [fields.time]: { order: "desc" } }, { pad_no: { order: "asc" } }],
        query: esQueries.buildEsQuery(esQueries.buildPadFilters(serial)),
        _source: D.getPadSourceFields(),
      },
      signal,
    );

    const total = typeof res.hits.total === "number" ? res.hits.total : (res.hits.total?.value ?? 0);
    D.state.padTotalPages = Math.max(1, Math.ceil(total / D.config.pageSize));
    D.state.padPage = page;

    ui.renderPadTable(res.hits.hits.map(transform.hitToPadRow));
    ui.updatePadPager();
  }

  async function loadDashboard(silent = false) {
    if (!silent) ui.setLoading(true);
    ui.hideError();

    if (!D.isPadLevel()) {
      ui.$("pad-panel")?.classList.add("hidden");
      D.state.view = "boards";
      D.state.selectedSerial = null;
    }

    D.state.abort?.abort();
    const controller = new AbortController();
    D.state.abort = controller;

    try {
      if (D.isPadLevel() && D.state.view === "pads" && D.state.selectedSerial) {
        const [aggRes, boardKpi] = await Promise.all([
          esClient.search(
            { size: 0, query: esQueries.buildEsQuery(esQueries.buildEsFilters()), aggs: esQueries.buildDashboardAggs() },
            controller.signal,
          ),
          computeBoardKpi(controller.signal),
        ]);
        if (controller.signal.aborted) return;
        ui.applyKpis(aggRes, boardKpi);
        await loadPads(D.state.padPage, controller.signal);
        ui.setStatus(true);
        return;
      }

      const query = esQueries.buildEsQuery(esQueries.buildEsFilters());
      const [aggRes, boardKpi] = await Promise.all([
        esClient.search({ size: 0, query, aggs: esQueries.buildDashboardAggs() }, controller.signal),
        computeBoardKpi(controller.signal),
      ]);

      if (controller.signal.aborted) return;

      ui.applyKpis(aggRes, boardKpi);
      await loadBoardList(controller.signal);
      ui.setStatus(true);
    } catch (err) {
      if (controller.signal.aborted) return;
      ui.setStatus(false);
      ui.showError(err.message || "Failed to load data");
    } finally {
      if (!controller.signal.aborted) {
        ui.setLoading(false);
        ui.updateBoardPager();
        ui.updatePadPager();
      }
    }
  }

  async function checkHealth() {
    if (D.useMock()) {
      ui.setStatus(true);
      D.applyProfileBanner();
      return;
    }

    D.applyProfileBanner();

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
    if (!serial || !D.isPadLevel()) return;
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
    D.state.time = ui.$("time").value;
    D.state.line = ui.$("line").value;
    D.state.model = ui.$("model").value;

    const newStation = ui.$("station").value;
    if (newStation !== D.state.station) {
      D.state.station = newStation;
      D.applyStationSchema(newStation);
      updatePadPanelVisibility();
    }

    D.state.selectedSerial = null;
    resetBoardPaging();
    resetPadPaging();
    invalidateBoardCache();
    ui.showBoardView();
    loadDashboard();
  }

  ui.$("time").addEventListener("change", onFilterChange);
  ui.$("line").addEventListener("change", onFilterChange);
  ui.$("model").addEventListener("change", onFilterChange);
  ui.$("station").addEventListener("change", onFilterChange);
  ui.$("refresh").addEventListener("click", () => loadDashboard());
  ui.$("retry").addEventListener("click", () => loadDashboard());
  ui.$("back-boards").addEventListener("click", backToBoards);

  ui.$("board-prev").addEventListener("click", () => {
    if (D.state.boardPage > 0) {
      D.state.boardPage--;
      loadDashboard();
    }
  });

  ui.$("board-next").addEventListener("click", () => {
    if (D.state.boardPage + 1 < D.state.boardTotalPages) {
      D.state.boardPage++;
      loadDashboard();
    }
  });

  ui.$("pad-prev").addEventListener("click", () => {
    if (D.state.padPage > 0) {
      D.state.padPage--;
      loadDashboard();
    }
  });

  ui.$("pad-next").addEventListener("click", () => {
    if (D.state.padPage + 1 < D.state.padTotalPages) {
      D.state.padPage++;
      loadDashboard();
    }
  });

  setInterval(() => loadDashboard(true), D.config.refreshMs);
  setInterval(checkHealth, D.config.healthMs);

  loadFilters()
    .then(() => loadDashboard())
    .catch((err) => ui.showError(err.message || "Failed to load"));

  checkHealth();
})(window.Dashboard);
