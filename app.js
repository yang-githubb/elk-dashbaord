const REFRESH_MS = 30_000;
const HEALTH_MS = 60_000;
const PAGE_SIZE = 25;
const FETCH_TIMEOUT_MS = 35_000;

function demoCount() {
  return extractBoards(window.DEMO_RECORDS ?? []).length;
}

const TIME_RANGES = {
  "15m": 15 * 60 * 1000,
  "1h": 60 * 60 * 1000,
  "6h": 6 * 60 * 60 * 1000,
  "24h": 24 * 60 * 60 * 1000,
  "7d": 7 * 24 * 60 * 60 * 1000,
  "30d": 30 * 24 * 60 * 60 * 1000,
};

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
  PASS: "#22c55e",
  FAIL: "#ef4444",
  GOOD: "#3b82f6",
};

const $ = (id) => document.getElementById(id);
const aggFieldCache = new Map();

const state = {
  time: "all",
  line: "",
  model: "",
  page: 0,
  fields: { time: "@timestamp", line: "line", station: "station" },
  totalPages: 1,
  loading: false,
  abort: null,
};

function cfg() {
  return window.ES_CONFIG ?? {};
}

function isDemoMode() {
  return cfg().useDemo !== false;
}

function padToResult(record) {
  const raw = String(record.result || record.pad_result || record.pcb_result || record.status || "").toUpperCase();
  if (raw === "FAIL" || raw === "ERROR" || raw === "NG") return "FAIL";
  if (raw === "PASS") return "PASS";
  if (raw === "GOOD" || raw === "OK") return "GOOD";
  if (raw === "WARN") return "FAIL";
  return "PASS";
}

function worstResult(results) {
  if (results.includes("FAIL")) return "FAIL";
  if (results.includes("PASS")) return "PASS";
  return "GOOD";
}

function generalFromResult(result) {
  return result === "FAIL" ? "FAIL" : "PASS";
}

function extractBoards(records) {
  const map = new Map();

  for (const r of records) {
    const serial = r.serial || r.board_id || r.id;
    const model = r.model || r.line || "Unknown";
    const line = r.line || "Unknown";
    const ts = r["@timestamp"] || r[state.fields?.time];
    const padResult = padToResult(r);

    if (!map.has(serial)) {
      map.set(serial, {
        id: serial,
        serial,
        model,
        line,
        "@timestamp": ts,
        date: ts ? ts.slice(0, 10) : "Unknown",
        padResults: [],
        source: r.source || "unknown",
      });
    }

    const board = map.get(serial);
    board.padResults.push(padResult);
    if (ts && new Date(ts) > new Date(board["@timestamp"])) {
      board["@timestamp"] = ts;
      board.date = ts.slice(0, 10);
    }
    if (r.model) board.model = r.model;
    if (r.line) board.line = r.line;
  }

  return [...map.values()].map((b) => {
    const result = worstResult(b.padResults);
    return {
      ...b,
      result,
      general: generalFromResult(result),
      pad_count: b.padResults.length,
    };
  });
}

function isAllTime() {
  return state.time === "all";
}

function timeSelectOptions() {
  return TIME_ORDER.map((t) => ({ value: t, label: TIME_LABELS[t] || t }));
}

function getFields() {
  const defaults = {
    time: "@timestamp",
    line: "line",
    model: "model",
    serial: "board_id",
    general: "general",
    result: "result",
  };
  return { ...defaults, ...(cfg().fields ?? {}) };
}

function esField(field) {
  return field.includes(".") ? field : `${field}.keyword`;
}

function buildEsFilters() {
  const fields = getFields();
  const filters = [];
  if (!isAllTime()) {
    filters.push({ range: { [fields.time]: { gte: ES_TIME_RANGES[state.time] } } });
  }
  if (state.line) filters.push({ term: { [esField(fields.line)]: state.line } });
  if (state.model) filters.push({ term: { [esField(fields.model)]: state.model } });
  return filters;
}

function termsToCounts(buckets, keys) {
  const counts = Object.fromEntries(keys.map((k) => [k, 0]));
  for (const b of buckets ?? []) {
    const key = String(b.key).toUpperCase();
    if (counts[key] !== undefined) counts[key] = b.doc_count;
  }
  return counts;
}

function buildDashboardAggs() {
  const fields = getFields();
  return {
    board_count: { cardinality: { field: esField(fields.serial) } },
    general: { terms: { field: esField(fields.general), size: 10 } },
    result: { terms: { field: esField(fields.result), size: 10 } },
    lines: { terms: { field: esField(fields.line), size: 200 } },
    models: { terms: { field: esField(fields.model), size: 200 } },
  };
}

function hitToTableRow(hit) {
  const fields = getFields();
  const s = hit._source ?? {};
  const ts = s[fields.time];
  const result = String(s[fields.result] ?? padToResult(s)).toUpperCase();
  const general = String(s[fields.general] ?? generalFromResult(result)).toUpperCase();
  return {
    date: ts ? String(ts).slice(0, 10) : "—",
    serial: s[fields.serial] ?? hit._id,
    model: s[fields.model] ?? "—",
    line: s[fields.line] ?? "—",
    general,
    result,
    pad_count: s.pad_count ?? "—",
    source: "elk",
  };
}

function renderKpisFromCounts(boardCount, generalCounts, resultCounts) {
  const pass = generalCounts.PASS ?? 0;
  const fail = generalCounts.FAIL ?? 0;
  const good = resultCounts.GOOD ?? 0;
  const denom = pass + fail || boardCount;
  const yieldPct = denom ? Math.round((pass / denom) * 100) : 0;

  $("kpi-boards").textContent = boardCount.toLocaleString();
  $("kpi-pass").textContent = pass.toLocaleString();
  $("kpi-fail").textContent = fail.toLocaleString();
  $("kpi-good").textContent = good.toLocaleString();
  $("kpi-yield").textContent = denom ? `${yieldPct}%` : "—";
}

function applyEsView(aggRes, tableRows, totalHits, page) {
  state.page = page;
  const aggs = aggRes.aggregations ?? {};
  const boardCount = aggs.board_count?.value ?? totalHits ?? 0;
  const generalCounts = termsToCounts(aggs.general?.buckets, ["PASS", "FAIL"]);
  const resultCounts = termsToCounts(aggs.result?.buckets, ["GOOD", "PASS", "FAIL"]);

  if (totalHits) {
    state.totalPages = Math.ceil(totalHits / PAGE_SIZE);
  } else {
    state.totalPages = page + (tableRows.length === PAGE_SIZE ? 2 : 1);
  }

  $("updated").textContent = `Updated ${formatTime(new Date().toISOString())}`;
  renderKpisFromCounts(boardCount, generalCounts, resultCounts);
  renderCenteredPie($("chart-general-date"), generalCounts, ["PASS", "FAIL"], { PASS: "Pass", FAIL: "Fail" });
  renderCenteredPie($("chart-model-date"), resultCounts, ["GOOD", "PASS", "FAIL"], { GOOD: "Good", PASS: "Pass", FAIL: "Fail" });
  renderCenteredPie($("chart-serial"), resultCounts, ["GOOD", "PASS", "FAIL"], { GOOD: "Good", PASS: "Pass", FAIL: "Fail" });
  renderCenteredPie($("chart-line-result"), generalCounts, ["PASS", "FAIL"], { PASS: "Pass", FAIL: "Fail" });
  renderTable(tableRows);
  updatePager();
  updateModeLabel(boardCount);

  if (totalHits > 1_000_000) {
    $("page-info").textContent = `Page ${page + 1} · ${totalHits.toLocaleString()} records (use filters to narrow)`;
  }
}

function updateModeLabel(boardCount) {
  const range = TIME_LABELS[state.time] || state.time;
  $("mode-label").textContent = `${boardCount} boards · ${range} · auto-refresh every ${REFRESH_MS / 1000}s`;
}

function filterDemoRecords(records) {
  return records.filter((r) => {
    if (!isAllTime()) {
      const since = Date.now() - (TIME_RANGES[state.time] ?? TIME_RANGES["7d"]);
      const ts = new Date(r["@timestamp"]).getTime();
      if (Number.isNaN(ts) || ts < since) return false;
    }
    if (state.line && r.line !== state.line) return false;
    if (state.model && (r.model || r.line) !== state.model) return false;
    return true;
  });
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

function cellValue(value) {
  if (value === null || value === undefined) return "—";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function showError(message) {
  $("error-text").textContent = message;
  $("error").classList.remove("hidden");
}

function hideError() {
  $("error").classList.add("hidden");
}

function setStatus(mode) {
  const el = $("status");
  if (mode === "demo") {
    el.textContent = "Demo";
    el.className = "status status-demo";
  } else if (mode === "live") {
    el.textContent = "Connected";
    el.className = "status status-ok";
  } else {
    el.textContent = "Disconnected";
    el.className = "status status-bad";
  }
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
  if ([...select.options].some((o) => o.value === current)) select.value = current;
}

function countBoards(boards, field, keys) {
  const counts = Object.fromEntries(keys.map((k) => [k, 0]));
  for (const b of boards) {
    const v = b[field];
    if (counts[v] !== undefined) counts[v]++;
  }
  return counts;
}

function pieHtml(counts, keys, labels, size = "md") {
  const items = keys
    .filter((k) => counts[k] > 0)
    .map((k) => ({ key: k, count: counts[k], label: labels[k] || k, color: RESULT_COLORS[k] }));

  if (!items.length) {
    return '<p class="empty-note">No data</p>';
  }

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
      const p = ((i.count / total) * 100).toFixed(0);
      return `<li><span class="legend-dot" style="background:${i.color}"></span>${i.label} <strong>${i.count}</strong> (${p}%)</li>`;
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
  container.innerHTML = "";
  const hasData = keys.some((k) => counts[k] > 0);
  if (!hasData) {
    container.innerHTML = '<p class="empty-note">No data for selected filters.</p>';
    return;
  }
  container.innerHTML = `<div class="pie-center">${pieHtml(counts, keys, labels, size)}</div>`;
}

function renderGeneralDatePieChart(container, boards) {
  if (!boards.length) {
    container.innerHTML = '<p class="empty-note">No data for selected filters.</p>';
    return;
  }
  const counts = countBoards(boards, "general", ["PASS", "FAIL"]);
  renderCenteredPie(container, counts, ["PASS", "FAIL"], { PASS: "Pass", FAIL: "Fail" });
}

function renderModelDatePieChart(container, boards) {
  if (!boards.length) {
    container.innerHTML = '<p class="empty-note">No data for selected filters.</p>';
    return;
  }
  const counts = countBoards(boards, "result", ["GOOD", "PASS", "FAIL"]);
  renderCenteredPie(container, counts, ["GOOD", "PASS", "FAIL"], { GOOD: "Good", PASS: "Pass", FAIL: "Fail" });
}

function renderSerialPieChart(container, boards) {
  if (!boards.length) {
    container.innerHTML = '<p class="empty-note">No data for selected filters.</p>';
    return;
  }
  const counts = countBoards(boards, "result", ["GOOD", "PASS", "FAIL"]);
  renderCenteredPie(container, counts, ["GOOD", "PASS", "FAIL"], { GOOD: "Good", PASS: "Pass", FAIL: "Fail" });
}

function renderLinePassFailPieChart(container, boards) {
  if (!boards.length) {
    container.innerHTML = '<p class="empty-note">No data for selected filters.</p>';
    return;
  }
  const counts = countBoards(boards, "general", ["PASS", "FAIL"]);
  renderCenteredPie(container, counts, ["PASS", "FAIL"], { PASS: "Pass", FAIL: "Fail" });
}

function renderKpis(boards) {
  const pass = boards.filter((b) => b.general === "PASS").length;
  const fail = boards.filter((b) => b.general === "FAIL").length;
  const good = boards.filter((b) => b.result === "GOOD").length;
  const yieldPct = boards.length ? Math.round((pass / boards.length) * 100) : 0;

  $("kpi-boards").textContent = boards.length.toLocaleString();
  $("kpi-pass").textContent = pass.toLocaleString();
  $("kpi-fail").textContent = fail.toLocaleString();
  $("kpi-good").textContent = good.toLocaleString();
  $("kpi-yield").textContent = boards.length ? `${yieldPct}%` : "—";
}

function renderBoardCharts(boards) {
  renderGeneralDatePieChart($("chart-general-date"), boards);
  renderModelDatePieChart($("chart-model-date"), boards);
  renderSerialPieChart($("chart-serial"), boards);
  renderLinePassFailPieChart($("chart-line-result"), boards);
}

function renderTable(hits) {
  const columns = ["date", "serial", "model", "line", "general", "result", "pad_count", "source"];
  const thead = $("thead");
  const tbody = $("tbody");
  thead.innerHTML = "";
  tbody.innerHTML = "";

  const headRow = document.createElement("tr");
  for (const col of columns) {
    const th = document.createElement("th");
    th.textContent = col.replace("_", " ");
    headRow.appendChild(th);
  }
  thead.appendChild(headRow);

  if (!hits.length) {
    const tr = document.createElement("tr");
    const td = document.createElement("td");
    td.colSpan = columns.length;
    td.className = "empty-cell";
    td.textContent = state.loading ? "Loading…" : "No boards match the current filters.";
    tr.appendChild(td);
    tbody.appendChild(tr);
    return;
  }

  for (const row of hits) {
    const tr = document.createElement("tr");
    for (const col of columns) {
      const td = document.createElement("td");
      const raw = row[col];
      if (col === "general" || col === "result") {
        const cls = String(raw).toLowerCase();
        const color = RESULT_COLORS[raw] ?? "#8b9cb3";
        td.innerHTML = `<span class="result-pill" style="background:${color}22;color:${color};border-color:${color}55">${cellValue(raw)}</span>`;
      } else {
        td.textContent = cellValue(raw);
      }
      tr.appendChild(td);
    }
    tbody.appendChild(tr);
  }
}

function applyView(boards, page) {
  state.page = page;
  state.totalPages = Math.max(1, Math.ceil(boards.length / PAGE_SIZE));
  const pageHits = boards.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  $("updated").textContent = `Updated ${formatTime(new Date().toISOString())}`;
  renderKpis(boards);
  renderBoardCharts(boards);
  renderTable(pageHits);
  updatePager();
  updateModeLabel(boards.length);
}

function updatePager() {
  $("page-info").textContent = `Page ${state.page + 1} of ${state.totalPages}`;
  $("prev").disabled = state.page <= 0 || state.loading;
  $("next").disabled = state.page + 1 >= state.totalPages || state.loading;
}

function loadDemoFilters() {
  const boards = extractBoards(window.DEMO_RECORDS ?? []);
  state.fields = cfg().fields ?? state.fields;

  fillSelect($("time"), timeSelectOptions(), (o) => o.label);
  $("time").value = state.time || "all";

  const lines = [...new Set(boards.map((b) => b.line))].sort();
  const models = [...new Set(boards.map((b) => b.model))].sort();

  fillSelect($("line"), [{ value: "", label: "All lines" }, ...lines.map((l) => ({ value: l, label: l }))]);
  fillSelect($("model"), [{ value: "", label: "All models" }, ...models.map((m) => ({ value: m, label: m }))]);

  $("demo-banner").classList.remove("hidden");
  setStatus("demo");
}

function loadDemoData(page, silent) {
  state.loading = !silent;
  if (!silent) $("loading-tag").classList.add("hidden");
  else if ($("tbody").rows.length) $("loading-tag").classList.remove("hidden");

  hideError();
  $("refresh").disabled = true;

  const filtered = extractBoards(filterDemoRecords(window.DEMO_RECORDS ?? []));
  applyView(filtered, page);
  setStatus("demo");

  state.loading = false;
  $("loading-tag").classList.add("hidden");
  $("refresh").disabled = false;
}

async function checkHealth() {
  if (isDemoMode()) {
    setStatus("demo");
    return;
  }
  try {
    const { node, username, password } = cfg();
    const res = await fetch(node.replace(/\/$/, ""), {
      headers: { Authorization: "Basic " + btoa(`${username}:${password}`) },
    });
    setStatus(res.ok ? "live" : "off");
  } catch {
    setStatus("off");
  }
}

function authHeader() {
  const { username, password } = cfg();
  return "Basic " + btoa(`${username}:${password}`);
}

function searchUrl() {
  const { node, index } = cfg();
  return `${node.replace(/\/$/, "")}/${index}/_search`;
}

function buildEsQuery(filters) {
  if (!filters.length) return { match_all: {} };
  return { bool: { filter: filters } };
}

async function esSearch(body, signal) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  const onAbort = () => controller.abort();
  signal?.addEventListener("abort", onAbort);

  try {
    const res = await fetch(searchUrl(), {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: authHeader() },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error?.reason || res.statusText);
    return data;
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener("abort", onAbort);
  }
}

async function loadLiveFilters() {
  state.fields = getFields();
  const filters = [];
  if (!isAllTime()) {
    filters.push({ range: { [state.fields.time]: { gte: ES_TIME_RANGES[state.time] } } });
  }

  const res = await esSearch({
    size: 0,
    query: buildEsQuery(filters),
    aggs: {
      lines: { terms: { field: esField(state.fields.line), size: 200, order: { _key: "asc" } } },
      models: { terms: { field: esField(state.fields.model), size: 200, order: { _key: "asc" } } },
    },
  });

  fillSelect($("time"), timeSelectOptions(), (o) => o.label);
  $("time").value = state.time || "all";

  const lines = res.aggregations?.lines?.buckets?.map((b) => String(b.key)) ?? [];
  const models = res.aggregations?.models?.buckets?.map((b) => String(b.key)) ?? [];

  fillSelect($("line"), [{ value: "", label: "All lines" }, ...lines.map((l) => ({ value: l, label: l }))]);
  fillSelect($("model"), [{ value: "", label: "All models" }, ...models.map((m) => ({ value: m, label: m }))]);

  $("demo-banner").classList.add("hidden");
}

async function loadLiveData(page, silent) {
  state.loading = !silent;
  hideError();
  $("refresh").disabled = true;

  state.abort?.abort();
  const controller = new AbortController();
  state.abort = controller;

  try {
    const fields = getFields();
    state.fields = fields;
    const filters = buildEsFilters();
    const query = buildEsQuery(filters);

    const [aggRes, tableRes] = await Promise.all([
      esSearch({ size: 0, query, aggs: buildDashboardAggs() }, controller.signal),
      esSearch(
        {
          from: page * PAGE_SIZE,
          size: PAGE_SIZE,
          track_total_hits: true,
          sort: [{ [fields.time]: { order: "desc" } }],
          query,
        },
        controller.signal,
      ),
    ]);

    if (controller.signal.aborted) return;

    const total =
      typeof tableRes.hits.total === "number" ? tableRes.hits.total : (tableRes.hits.total?.value ?? 0);
    const rows = tableRes.hits.hits.map(hitToTableRow);

    applyEsView(aggRes, rows, total, page);
    setStatus("live");
  } catch (err) {
    if (controller.signal.aborted) return;
    setStatus("off");
    showError(err.message || "Failed to load data");
  } finally {
    if (!controller.signal.aborted) {
      state.loading = false;
      $("refresh").disabled = false;
    }
  }
}

function loadFilters() {
  return isDemoMode() ? Promise.resolve(loadDemoFilters()) : loadLiveFilters();
}

function loadData(page, silent) {
  if (isDemoMode()) {
    loadDemoData(page, silent);
    return Promise.resolve();
  }
  return loadLiveData(page, silent);
}

function onFilterChange() {
  state.time = $("time").value;
  state.line = $("line").value;
  state.model = $("model").value;
  state.page = 0;
  loadData(0);
}

$("time").addEventListener("change", onFilterChange);
$("line").addEventListener("change", onFilterChange);
$("model").addEventListener("change", onFilterChange);
$("refresh").addEventListener("click", () => loadData(state.page));
$("retry").addEventListener("click", () => loadData(state.page));
$("prev").addEventListener("click", () => loadData(state.page - 1));
$("next").addEventListener("click", () => loadData(state.page + 1));

setInterval(() => loadData(state.page, true), REFRESH_MS);
setInterval(checkHealth, HEALTH_MS);

loadFilters()
  .then(() => {
    $("time").value = state.time || "all";
    state.time = $("time").value;
    return loadData(0);
  })
  .catch((err) => showError(err.message || "Failed to load"));

checkHealth();
