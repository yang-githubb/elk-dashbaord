/**
 * SMT Board Dashboard
 *
 * Board list (serial numbers via composite agg) → click serial → pad inspection table.
 * KPIs/charts use ES aggregations; never loads full dataset in browser.
 */

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const BOARD_CACHE_MS = 180_000;
const REFRESH_MS = 120_000;
const HEALTH_MS = 60_000;
const PAGE_SIZE = 25;
const FETCH_TIMEOUT_MS = 35_000;
const COMPOSITE_PAGE_SIZE = 5000;

const TIME_LABELS = {
  all: "All time",
  "15m": "Last 15 minutes",
  "1h": "Last 1 hour",
  "6h": "Last 6 hours",
  "24h": "Last 24 hours",
  "7d": "Last 7 days",
  "30d": "Last 30 days",
};

const TIME_ORDER = ["all", "15m", "1h", "6h", "24h", "7d", "30d"];

const ES_TIME_RANGES = {
  "15m": "now-15m",
  "1h": "now-1h",
  "6h": "now-6h",
  "24h": "now-24h",
  "7d": "now-7d",
  "30d": "now-30d",
};

const RESULT_COLORS = {
  GOOD: "#22c55e",
  PASS: "#f59e0b",
  FAIL: "#ef4444",
};

const BOARD_COLUMNS = [
  { key: "serial", label: "Serial" },
  { key: "model", label: "PCB Name" },
  { key: "line", label: "Line" },
  { key: "timestamp", label: "Last Inspection", type: "time" },
  { key: "pad_count", label: "Pads", type: "number" },
  { key: "result", label: "Result", type: "result" },
];

const PAD_COLUMNS = [
  { key: "timestamp", label: "Timestamp", type: "time" },
  { key: "model", label: "PCB Name" },
  { key: "line", label: "Line" },
  { key: "station", label: "Station" },
  { key: "machine", label: "Machine" },
  { key: "component_id", label: "Component" },
  { key: "pad_no", label: "Pad No" },
  { key: "volume", label: "Volume", type: "number" },
  { key: "height", label: "Height", type: "number" },
  { key: "area", label: "Area", type: "number" },
  { key: "offset_x", label: "Offset X", type: "number" },
  { key: "offset_y", label: "Offset Y", type: "number" },
  { key: "is_defect", label: "Defect", type: "bool" },
  { key: "inspection_date", label: "Insp. Date" },
];

const PAD_SOURCE_FIELDS = [
  "timestamp", "pcb_name", "line", "station", "machine",
  "component_id", "pad_no", "volume", "height", "area", "offset_x", "offset_y",
  "is_defect", "inspection_date",
];

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

const $ = (id) => document.getElementById(id);

const state = {
  time: "all",
  line: "",
  model: "",
  station: "SPI",   // ✅ NEW
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

let boardKpiCache = null;
let boardKpiTs = 0;

// ---------------------------------------------------------------------------
// Config helpers
// ---------------------------------------------------------------------------

function getSchema() {
  if (state.station === "AOI") {
    return {
      serial: "panel_barcode",
      result: "result",
      isPad: false,
    };
  }

  return {
    serial: "array_barcode",
    result: "pcb_result",
    isPad: true,
  };
}

function cfg() {
  return window.ES_CONFIG ?? {};
}

function useMock() {
  return cfg().useMock === true;
}

function getFields() {
  const schema = getSchema();
  const defaults = {
    time: "timestamp",
    line: "line",
    model: "pcb_name",
    serial: schema.serial, 
    station: "station",
  };
  return { ...defaults, ...(cfg().fields ?? {}) };
}

function esField(field) {
  return field.includes(".") ? field : `${field}.keyword`;
}

function isAllTime() {
  return state.time === "all";
}

// ---------------------------------------------------------------------------
// Elasticsearch query building
// ---------------------------------------------------------------------------

function buildEsFilters() {
  const fields = getFields();
  const filters = [];

  if (!isAllTime()) {
    filters.push({ range: { [fields.time]: { gte: ES_TIME_RANGES[state.time] } } });
  }
  if (state.line) {
    filters.push({ term: { [esField(fields.line)]: state.line } });
  }
  if (state.model) {
    filters.push({ term: { [esField(fields.model)]: state.model } });
  }
  filters.push({ term: { [esField(fields.station)]: state.station } });

  return filters;
}

function buildPadFilters(serial) {
  const fields = getFields();
  return [...buildEsFilters(), { term: { [esField(fields.serial)]: serial } }];
}

function buildEsQuery(filters) {
  return filters.length ? { bool: { filter: filters } } : { match_all: {} };
}

function buildDashboardAggs() {
  const schema = getSchema();
  const resultField = `${schema.result}.keyword`;

  const failValues = state.station === "AOI"
    ? ["FAIL"]        // ✅ AOI
    : ["NG"];         // ✅ SPI

  const passValues = state.station === "AOI"
    ? ["PASS"]
    : ["PASS", "WARNING"];

  return {
    total_count: { value_count: { field: resultField } },
    total_boards: { cardinality: { field: getFields().serial + ".keyword" } },

    count_good: { filter: { term: { [resultField]: "GOOD" } } },
    count_pass: { filter: { terms: { [resultField]: passValues } } },
    count_fail: { filter: { terms: { [resultField]: failValues } } },
  };
}

/** KPI composite — walks all boards in pages of 5000. */
function buildBoardKpiAgg(afterKey = null) {
  const serialField = getFields().serial + ".keyword";
  const schema = getSchema();
  const resultField = `${schema.result}.keyword`;
  const failValue = state.station === "AOI" ? "FAIL" : "NG";
  const agg = {
    size: 0,
    query: buildEsQuery(buildEsFilters()),
    aggs: {
      boards: {
        composite: {
          size: COMPOSITE_PAGE_SIZE,
          sources: [{ board: { terms: { field: serialField } } }],
        },
        aggs: {
          has_ng: {
            filter: { term: { [resultField]: failValue } }
          }
        },
      },
    },
  };
  if (afterKey) agg.aggs.boards.composite.after = afterKey;
  return agg;
}

/** Board list table — one composite page (25 boards). */
function buildBoardListAgg(afterKey = null) {
  const serialField = getFields().serial + ".keyword";
  const schema = getSchema();
  const resultField = `${schema.result}.keyword`;
  const fields = getFields();
  const failValue = state.station === "AOI" ? "FAIL" : "NG";
  const agg = {
    size: 0,
    query: buildEsQuery(buildEsFilters()),
    aggs: {
      boards: {
        composite: {
          size: PAGE_SIZE,
          sources: [{ board: { terms: { field: serialField } } }],
        },
        aggs: {
          latest: { max: { field: fields.time } },
          top_line: { terms: { field: esField(fields.line), size: 1 } },
          top_model: { terms: { field: esField(fields.model), size: 1 } },
          pad_count: state.station === "SPI"
            ? { value_count: { field: "pad_no" } }
            : { value_count: { field: "_index" } },
          has_ng: {
            filter: { term: { [resultField]: failValue } }
          },
        },
      },
    },
  };
  if (afterKey) agg.aggs.boards.composite.after = afterKey;
  return agg;
}

// ---------------------------------------------------------------------------
// Result normalization
// ---------------------------------------------------------------------------

function normalizePcbResult(value) {
  const v = String(value || "").toUpperCase();

  if (v === "GOOD") return "GOOD";
  if (v === "PASS" || v === "WARNING") return "PASS";

  if (v === "NG" || v === "FAIL") return "FAIL"; // ✅ AOI fix

  return "PASS";
}

function boardBucketToRow(bucket) {
  const hasNg = (bucket.has_ng?.doc_count ?? 0) > 0;
  const latest = bucket.latest?.value;
  return {
    serial: bucket.key.board,
    model: bucket.top_model?.buckets?.[0]?.key ?? null,
    line: bucket.top_line?.buckets?.[0]?.key ?? null,
    timestamp: latest != null ? (typeof latest === "number" ? new Date(latest).toISOString() : latest) : null,
    pad_count: bucket.pad_count?.value ?? bucket.doc_count ?? 0,
    result: hasNg ? "FAIL" : "PASS",
  };
}

function hitToPadRow(hit) {
  const fields = getFields();
  const s = hit._source ?? {};
  const ts = s[fields.time] ?? s.timestamp;

  return {
    timestamp: ts ?? null,
    model: s[fields.model] ?? s.pcb_name ?? null,
    line: s.line ?? null,
    station: s.station ?? null,
    machine: s.machine ?? null,
    component_id: s.component_id ?? null,
    pad_no: s.pad_no ?? null,
    volume: s.volume ?? null,
    height: s.height ?? null,
    area: s.area ?? null,
    offset_x: s.offset_x ?? null,
    offset_y: s.offset_y ?? null,
    is_defect: s.is_defect ?? null,
    inspection_date: s.inspection_date ?? null,
  };
}

// ---------------------------------------------------------------------------
// DOM helpers
// ---------------------------------------------------------------------------

function setText(id, value) {
  const el = $(id);
  if (el) el.textContent = value;
}

function showError(message) {
  $("error-text").textContent = message;
  $("error").classList.remove("hidden");
}

function hideError() {
  $("error").classList.add("hidden");
}

function setLoading(active) {
  state.loading = active;
  $("refresh").disabled = active;
  $("loading-tag").classList.toggle("hidden", !active || state.view !== "boards");
  $("pad-loading-tag").classList.toggle("hidden", !active || state.view !== "pads");
}

function setStatus(connected) {
  const el = $("status");
  el.textContent = connected ? "Connected" : "Disconnected";
  el.className = connected ? "status status-ok" : "status status-bad";
}

function setMockBanner(visible) {
  $("mock-banner")?.classList.toggle("hidden", !visible);
}

function showBoardView() {
  state.view = "boards";
  $("board-panel").classList.remove("hidden");
  $("pad-panel").classList.add("hidden");
}

function showPadView(serial) {
  state.view = "pads";
  state.selectedSerial = serial;
  setText("pad-serial-label", serial);
  $("board-panel").classList.add("hidden");
  $("pad-panel").classList.remove("hidden");
}

function fillSelect(select, options, labelFn) {
  const current = select.value;
  select.innerHTML = "";
  for (const opt of options) {
    const el = document.createElement("option");
    el.value = opt.value;
    el.textContent = labelFn ? labelFn(opt) : opt.label;
    select.appendChild(el);
  }
  if ([...select.options].some((o) => o.value === current)) {
    select.value = current;
  }
}

function cellValue(value) {
  if (value == null) return "—";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function formatNumber(value) {
  const n = Number(value);
  if (Number.isNaN(n)) return cellValue(value);
  return n.toLocaleString(undefined, { maximumFractionDigits: 4 });
}

function formatTime(value) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleString(undefined, {
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatTableCell(col, raw) {
  if (raw == null) return "—";
  if (col.type === "bool") return raw ? "Yes" : "No";
  if (col.type === "number") return formatNumber(raw);
  if (col.type === "time") return formatTime(raw);
  return cellValue(raw);
}

function resultPillHtml(value) {
  const label = cellValue(value);
  const color = RESULT_COLORS[value] ?? "#8b9cb3";
  return `<span class="result-pill" style="background:${color}22;color:${color};border-color:${color}55">${label}</span>`;
}

function updateModeLabel(padCount, boardCount) {
  const range = TIME_LABELS[state.time] || state.time;
  setText("mode-label", `${boardCount} boards · ${padCount} pads · ${range} · refresh ${REFRESH_MS / 1000}s`);
}

function updateBoardPager() {
  setText("board-page-info", `Page ${state.boardPage + 1} of ${state.boardTotalPages}`);
  $("board-prev").disabled = state.boardPage <= 0 || state.loading;
  $("board-next").disabled = state.boardPage + 1 >= state.boardTotalPages || state.loading;
}

function updatePadPager() {
  setText("pad-page-info", `Page ${state.padPage + 1} of ${state.padTotalPages}`);
  $("pad-prev").disabled = state.padPage <= 0 || state.loading;
  $("pad-next").disabled = state.padPage + 1 >= state.padTotalPages || state.loading;
}

function resetBoardPaging() {
  state.boardPage = 0;
  state.boardAfterStack = [null];
  state.boardTotalPages = 1;
}

function resetPadPaging() {
  state.padPage = 0;
  state.padTotalPages = 1;
}

function invalidateBoardCache() {
  boardKpiCache = null;
  boardKpiTs = 0;
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

function pieHtml(counts, keys, labels, size = "md") {
  const items = keys
    .filter((k) => counts[k] > 0)
    .map((k) => ({ key: k, count: counts[k], label: labels[k] || k, color: RESULT_COLORS[k] }));

  if (!items.length) return '<p class="empty-note">No data</p>';

  const total = items.reduce((s, i) => s + i.count, 0);
  let pct = 0;
  const gradient = items
    .map((i) => {
      const start = pct;
      pct += (i.count / total) * 100;
      return `${i.color} ${start}% ${pct}%`;
    })
    .join(", ");

  const legend = items
    .map((i) => {
      const p = ((i.count / total) * 100).toFixed(2);
      return `<li><span class="legend-dot" style="background:${i.color}"></span>${i.label} <strong>${i.count.toLocaleString()}</strong> (${p}%)</li>`;
    })
    .join("");

  return `
    <div class="pie-card pie-${size}">
      <div class="pie" style="background:conic-gradient(${gradient})"></div>
      <ul class="pie-legend">${legend}</ul>
    </div>
  `;
}

function renderCenteredPie(container, counts, keys, labels, size = "lg") {
  if (!container) return;
  const hasData = keys.some((k) => counts[k] > 0);
  container.innerHTML = hasData
    ? `<div class="pie-center">${pieHtml(counts, keys, labels, size)}</div>`
    : '<p class="empty-note">No data for selected filters.</p>';
}

function renderDataTable(theadId, tbodyId, columns, rows, options = {}) {
  const thead = $(theadId);
  const tbody = $(tbodyId);
  thead.innerHTML = "";
  tbody.innerHTML = "";

  const headRow = document.createElement("tr");
  for (const col of columns) {
    const th = document.createElement("th");
    th.textContent = col.label;
    headRow.appendChild(th);
  }
  thead.appendChild(headRow);

  if (!rows.length) {
    const tr = document.createElement("tr");
    const td = document.createElement("td");
    td.colSpan = columns.length;
    td.className = "empty-cell";
    td.textContent = state.loading ? "Loading…" : (options.emptyText || "No records match the current filters.");
    tr.appendChild(td);
    tbody.appendChild(tr);
    return;
  }

  for (const row of rows) {
    const tr = document.createElement("tr");
    if (options.clickable) tr.classList.add("row-clickable");

    for (const col of columns) {
      const td = document.createElement("td");
      const raw = row[col.key];

      if (col.key === "serial" && options.onSerialClick) {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "serial-link";
        btn.textContent = cellValue(raw);
        btn.addEventListener("click", (e) => {
          e.stopPropagation();
          options.onSerialClick(raw);
        });
        td.appendChild(btn);
      } else if (col.type === "result") {
        td.innerHTML = resultPillHtml(raw);
      } else {
        td.textContent = formatTableCell(col, raw);
        if (col.key === "model") td.title = formatTableCell(col, raw);
      }
      tr.appendChild(td);
    }

    if (options.clickable && options.onRowClick) {
      tr.addEventListener("click", () => options.onRowClick(row));
    }

    tbody.appendChild(tr);
  }
}

function renderBoardTable(rows) {
  renderDataTable("board-thead", "board-tbody", BOARD_COLUMNS, rows, {
    emptyText: "No boards match the current filters.",
    clickable: true,
    onSerialClick: openPadView,
    onRowClick: (row) => openPadView(row.serial),
  });
}

function renderPadTable(rows) {
  renderDataTable("pad-thead", "pad-tbody", PAD_COLUMNS, rows, {
    emptyText: "No pads found for this serial.",
  });
}

function applyKpis(aggRes, boardKpi) {
  const aggs = aggRes.aggregations ?? {};
  const good = aggs.count_good?.doc_count ?? 0;
  const pass = aggs.count_pass?.doc_count ?? 0;
  const fail = aggs.count_fail?.doc_count ?? 0;
  const total = good + pass + fail;
  const padYield = total ? ((good + pass) / total) * 100 : 0;

  setText("kpi-board-count", boardKpi.boardCount.toLocaleString());
  setText("kpi-board-pass", boardKpi.boardPass.toLocaleString());
  setText("kpi-board-fail", boardKpi.boardFail.toLocaleString());
  setText("kpi-board-yield", `${boardKpi.boardYield.toFixed(2)}%`);

  setText("kpi-pad-count", total.toLocaleString());
  setText("kpi-pad-pass", pass.toLocaleString());
  setText("kpi-pad-fail", fail.toLocaleString());
  setText("kpi-pad-yield", `${padYield.toFixed(2)}%`);

  renderCenteredPie(
    $("chart-board"),
    { PASS: boardKpi.boardPass, FAIL: boardKpi.boardFail },
    ["PASS", "FAIL"],
    { PASS: "Pass", FAIL: "Fail" },
  );

  renderCenteredPie(
    $("chart-pad"),
    { GOOD: good, PASS: pass, FAIL: fail },
    ["GOOD", "PASS", "FAIL"],
    { GOOD: "Good", PASS: "Pass", FAIL: "Fail" },
  );

  updateModeLabel(total, boardKpi.boardCount);
  setText("updated", `Updated ${formatTime(new Date())}`);
}

// ---------------------------------------------------------------------------
// API layer
// ---------------------------------------------------------------------------

function searchUrl() {
  const { proxyUrl, node, index } = cfg();
  if (proxyUrl) {
    if (proxyUrl.startsWith("http")) return proxyUrl;
    const prefix = proxyUrl.startsWith("/") ? "" : "/";
    return `${window.location.origin}${prefix}${proxyUrl}`;
  }
  return `${node.replace(/\/$/, "")}/${index}/_search`;
}

function usesProxy() {
  return Boolean(cfg().proxyUrl);
}

function proxyBaseUrl() {
  const url = cfg().proxyUrl || "";
  if (url.startsWith("http")) return url.replace(/\/search\/?$/, "");
  return window.location.origin;
}

function authHeader() {
  const { username, password } = cfg();
  return "Basic " + btoa(`${username}:${password}`);
}

async function esSearch(body, signal) {
  if (useMock()) return window.mockEsSearch(body);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  const onAbort = () => controller.abort();
  signal?.addEventListener("abort", onAbort);

  try {
    const headers = { "Content-Type": "application/json" };
    if (!usesProxy()) headers.Authorization = authHeader();

    const res = await fetch(searchUrl(), {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    const data = await res.json();
    if (!res.ok) {
      const msg =
        typeof data.error === "string"
          ? data.error
          : data.error?.reason || data.hint || res.statusText;
      throw new Error(msg);
    }
    return data;
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener("abort", onAbort);
  }
}

async function computeBoardKpi(signal) {
  const now = Date.now();
  if (boardKpiCache && now - boardKpiTs < BOARD_CACHE_MS) {
    return boardKpiCache;
  }

  let afterKey = null;
  let boardPass = 0;
  let boardFail = 0;
  let boardCount = 0;

  while (true) {
    const res = await esSearch(buildBoardKpiAgg(afterKey), signal);
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

// ---------------------------------------------------------------------------
// Data loading
// ---------------------------------------------------------------------------

async function loadFilters() {
  const fields = getFields();
  const filters = [];

  if (!isAllTime()) {
    filters.push({ range: { [fields.time]: { gte: ES_TIME_RANGES[state.time] } } });
  }

  const res = await esSearch({
    size: 0,
    query: buildEsQuery(filters),
    aggs: {
      lines: { terms: { field: esField(fields.line), size: 200, order: { _key: "asc" } } },
      models: { terms: { field: esField(fields.model), size: 200, order: { _key: "asc" } } },
    },
  });

  fillSelect(
    $("time"),
    TIME_ORDER.map((t) => ({ value: t, label: TIME_LABELS[t] || t })),
    (o) => o.label,
  );
  $("time").value = state.time;

  const lines = res.aggregations?.lines?.buckets?.map((b) => String(b.key)) ?? [];
  const models = res.aggregations?.models?.buckets?.map((b) => String(b.key)) ?? [];

  fillSelect($("line"), [{ value: "", label: "All lines" }, ...lines.map((l) => ({ value: l, label: l }))]);
  fillSelect($("model"), [{ value: "", label: "All models" }, ...models.map((m) => ({ value: m, label: m }))]);

  setMockBanner(useMock());
}

async function loadBoardList(signal) {
  const afterKey = state.boardAfterStack[state.boardPage] ?? null;
  const res = await esSearch(buildBoardListAgg(afterKey), signal);
  const buckets = res.aggregations?.boards?.buckets ?? [];
  const rows = buckets.map(boardBucketToRow);

  const boardKpi = boardKpiCache ?? (await computeBoardKpi(signal));
  state.boardTotalPages = Math.max(1, Math.ceil(boardKpi.boardCount / PAGE_SIZE));

  const nextAfter = res.aggregations?.boards?.after_key;
  if (nextAfter && state.boardAfterStack.length === state.boardPage + 1) {
    state.boardAfterStack.push(nextAfter);
  }

  renderBoardTable(rows);
  updateBoardPager();
  return boardKpi;
}

async function loadPads(page = 0, signal) {
  const fields = getFields();
  const serial = state.selectedSerial;
  if (!serial) return;

  const res = await esSearch(
    {
      from: page * PAGE_SIZE,
      size: PAGE_SIZE,
      track_total_hits: true,
      sort: [{ [fields.time]: { order: "desc" } }, { pad_no: { order: "asc" } }],
      query: buildEsQuery(buildPadFilters(serial)),
      _source: PAD_SOURCE_FIELDS,
    },
    signal,
  );

  const total =
    typeof res.hits.total === "number" ? res.hits.total : (res.hits.total?.value ?? 0);
  state.padTotalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  state.padPage = page;

  renderPadTable(res.hits.hits.map(hitToPadRow));
  updatePadPager();
}

async function loadDashboard(silent = false) {
  if (!silent) setLoading(true);
  
  if (state.station === "AOI") {
    $("pad-panel").classList.add("hidden");
  }

  hideError();

  state.abort?.abort();
  const controller = new AbortController();
  state.abort = controller;

  try {
    if (state.view === "pads" && state.selectedSerial) {
      const [aggRes, boardKpi] = await Promise.all([
        esSearch({ size: 0, query: buildEsQuery(buildEsFilters()), aggs: buildDashboardAggs() }, controller.signal),
        computeBoardKpi(controller.signal),
      ]);
      if (controller.signal.aborted) return;
      applyKpis(aggRes, boardKpi);
      await loadPads(state.padPage, controller.signal);
      setStatus(true);
      return;
    }

    const query = buildEsQuery(buildEsFilters());
    const [aggRes, boardKpi] = await Promise.all([
      esSearch({ size: 0, query, aggs: buildDashboardAggs() }, controller.signal),
      computeBoardKpi(controller.signal),
    ]);

    if (controller.signal.aborted) return;

    applyKpis(aggRes, boardKpi);
    await loadBoardList(controller.signal);
    setStatus(true);
  } catch (err) {
    if (controller.signal.aborted) return;
    setStatus(false);
    showError(err.message || "Failed to load data");
  } finally {
    if (!controller.signal.aborted) {
      setLoading(false);
      updateBoardPager();
      updatePadPager();
    }
  }
}

async function checkHealth() {
  if (useMock()) {
    setStatus(true);
    setMockBanner(true);
    return;
  }

  setMockBanner(false);

  if (usesProxy()) {
    try {
      const res = await fetch(`${proxyBaseUrl()}/search`, { method: "OPTIONS" });
      setStatus(res.ok || res.status === 204);
    } catch {
      setStatus(false);
    }
    return;
  }

  try {
    const { node, username, password } = cfg();
    const res = await fetch(node.replace(/\/$/, ""), {
      headers: { Authorization: "Basic " + btoa(`${username}:${password}`) },
    });
    setStatus(res.ok);
  } catch {
    setStatus(false);
  }
}

// ---------------------------------------------------------------------------
// Navigation
// ---------------------------------------------------------------------------

function openPadView(serial) {
  if (!serial) return;
  
  if (state.station === "AOI") return; 

  showPadView(serial);
  resetPadPaging();
  loadDashboard();
}

function backToBoards() {
  state.selectedSerial = null;
  resetPadPaging();
  showBoardView();
  loadDashboard();
}

function onFilterChange() {
  state.time = $("time").value;
  state.line = $("line").value;
  state.model = $("model").value;
  state.station = $("station").value;
  state.selectedSerial = null;
  resetBoardPaging();
  resetPadPaging();
  invalidateBoardCache();
  showBoardView();
  loadDashboard();
}

// ---------------------------------------------------------------------------
// Events & init
// ---------------------------------------------------------------------------

$("time").addEventListener("change", onFilterChange);
$("line").addEventListener("change", onFilterChange);
$("model").addEventListener("change", onFilterChange);
$("refresh").addEventListener("click", () => loadDashboard());
$("retry").addEventListener("click", () => loadDashboard());
$("back-boards").addEventListener("click", backToBoards);

$("board-prev").addEventListener("click", () => {
  if (state.boardPage > 0) {
    state.boardPage--;
    loadDashboard();
  }
});

$("board-next").addEventListener("click", () => {
  if (state.boardPage + 1 < state.boardTotalPages) {
    state.boardPage++;
    loadDashboard();
  }
});

$("pad-prev").addEventListener("click", () => {
  if (state.padPage > 0) {
    state.padPage--;
    loadDashboard();
  }
});

$("pad-next").addEventListener("click", () => {
  if (state.padPage + 1 < state.padTotalPages) {
    state.padPage++;
    loadDashboard();
  }
});

setInterval(() => loadDashboard(true), REFRESH_MS);
setInterval(checkHealth, HEALTH_MS);

loadFilters()
  .then(() => loadDashboard())
  .catch((err) => showError(err.message || "Failed to load"));

checkHealth();
