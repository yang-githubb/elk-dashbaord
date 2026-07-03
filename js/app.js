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
    padSearch: "",
    boardSearch: ""
  };

  D.applyStationSchema(D.state.station);
  ui.$("station").value = D.state.station;
  ui.updateStationLabels();
  updatePadPanelVisibility();

  let boardKpiCache = null;
  let boardKpiTs = 0;

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
    const start = performance.now();
    try {
       const kpi = D.getKpi();

           
      console.log(
          "KPI serial field:",
          kpi.serialField
      );

      console.log(
          "KPI fail field:",
          kpi.boardFailField
      );
    const res = await esClient.search(
      {
        size: 0,
        query: esQueries.buildEsQuery(esQueries.buildEsFilters()),
        aggs: {
          total_boards: {
            cardinality: {
              field: kpi.serialField,
              precision_threshold: 100
            }
          },
          fail_boards: {
            filter: {
              terms: {
                [kpi.boardFailField]: kpi.boardFail
              }
            },
            aggs: {
              count: {
                cardinality: {
                  field: kpi.serialField,
                  precision_threshold: 100
                }
              }
            }
          }
        }
      },
      signal
    );

    const boardCount = res.aggregations.total_boards?.value ?? 0;
    const boardFail = res.aggregations.fail_boards?.count?.value ?? 0;
    const boardPass = boardCount - boardFail;
    return {
      boardCount,
      boardPass,
      boardFail,
      boardYield: boardCount ? (boardPass / boardCount) * 100 : 0
    };
    } finally {
      console.log(
        "computeBoardKpi:",
        (performance.now() - start).toFixed(0),
        "ms"
      );
    }
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
  }

  async function loadBoardList(signal) {
    
      console.log(
          "Using KPI cache:",
          !!boardKpiCache
      );

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

      let boardKpi = boardKpiCache;

      if (!boardKpi) {

          boardKpi = await computeBoardKpi(signal);

          boardKpiCache = boardKpi;
      }

      D.state.boardTotalPages = Math.max(
          1,
          Math.ceil(
              boardKpi.boardCount /
              D.config.pageSize
          )
      );

      const nextAfter =
          res.aggregations?.boards?.after_key;

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

      return boardKpi;
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

          if (D.state.station === "AOI") {

              query.bool.filter.push({
                prefix: {
                  "ref_descrd_name.keyword": searchText.toUpperCase()
                }
              });
          } else {
              const padNo = Number(searchText);

              if (!isNaN(padNo)) {
                  query.bool.filter.push({
                      term: {
                          pad_no: padNo
                      }
                  });
              }
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
    
      console.log(
          "Using KPI cache:",
          !!boardKpiCache
      );

      if (!silent) {
          ui.setLoading(true);
      }

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

          let boardKpi = boardKpiCache;

          if (!boardKpi) {

              boardKpi = await computeBoardKpi(
                  controller.signal
              );

              boardKpiCache = boardKpi;
          }

          const aggRes = await aggPromise;

          if (controller.signal.aborted) {
              return;
          }

          ui.applyKpis(
              aggRes,
              boardKpi
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
              err?.message || "Failed to load data"
          );

      } finally {

          if (!controller.signal.aborted) {

              ui.setLoading(false);

              ui.updateBoardPager();

              ui.updatePadPager();
          }
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

      ui.updateStationLabels();
      updatePadPanelVisibility();

      // clear dependent filters
      D.state.line = "";
      D.state.model = "";

      ui.$("line").value = "";
      ui.$("model").value = "";

      // reload dropdown contents
      loadFilters()
        .then(() => loadDashboard())
        .catch((err) => ui.showError(err.message || "Failed to load filters"));

      return;
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

  setInterval(() => loadDashboard(true), D.config.refreshMs);
  setInterval(checkHealth, D.config.healthMs);

  loadFilters()
    .then(() => loadDashboard())
    .catch((err) => ui.showError(err.message || "Failed to load"));

  checkHealth();
})(window.Dashboard);
