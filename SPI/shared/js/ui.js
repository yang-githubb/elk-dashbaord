/**
 * Charts, tables, KPI cards, and ES response → row transforms.
 */
(function (D) {
  const $ = (id) => document.getElementById(id);

  function cellValue(value) {
    if (value == null) return "—";
    if (typeof value === "object") return JSON.stringify(value);
    return String(value);
  }

  function formatCount(value) {
    const n = Number(value);
    return Number.isNaN(n) ? "—" : n.toLocaleString("en-US");
  }

  function formatSerial(value) {
    return value == null ? "—" : String(value);
  }

  function formatNumber(value) {
    const n = Number(value);
    if (Number.isNaN(n)) return cellValue(value);
    return n.toLocaleString("en-US", { maximumFractionDigits: 4 });
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
    if (col.type === "serial") return formatSerial(raw);
    if (col.type === "bool") return raw ? "Yes" : "No";
    if (col.type === "number") return formatNumber(raw);
    if (col.type === "time") return formatTime(raw);
    return cellValue(raw);
  }

  function resultPillHtml(value) {
    const colors = D.getResultColors();
    const label = cellValue(value);
    const color = colors[value] ?? "#8b9cb3";
    return `<span class="result-pill" style="background:${color}22;color:${color};border-color:${color}55">${label}</span>`;
  }

  function buildPieSvg(good, pass, fail) {
    const total = good + pass + fail;
    if (!total) {
      return `
        <div class="overview-pie-wrap">
          <div class="overview-pie" style="background:rgba(255,255,255,0.08)"></div>
        </div>`;
    }

    const goodPct = (good / total) * 100;
    const passPct = (pass / total) * 100;

    return `
      <div class="overview-pie-wrap">
        <div class="overview-pie" style="background: conic-gradient(
          #22c55e 0% ${goodPct}%,
          #f59e0b ${goodPct}% ${goodPct + passPct}%,
          #ef4444 ${goodPct + passPct}% 100%
        );"></div>
      </div>`;
  }

  function overviewStatsHtml(stats) {
    return stats
      .map((stat) => {
        const value =
          typeof stat.value === "string" ? stat.value : formatCount(stat.value);
        return `
          <div class="overview-stat">
            <span class="overview-stat-label">${stat.label}</span>
            <span class="overview-stat-value">${value}</span>
          </div>`;
      })
      .join("");
  }

  function buildOverviewCard({ goodCount, passCount, failCount, stats }) {
    return `
      <div class="overview-body">
        <div class="overview-left">
          ${buildPieSvg(goodCount, passCount, failCount)}
        </div>
        <div class="overview-stats">
          ${overviewStatsHtml(stats)}
        </div>
      </div>`;
  }

  function titleCaseFailure(key) {
    return String(key)
      .toLowerCase()
      .split("_")
      .join(" ")
      .replace(/\b\w/g, (c) => c.toUpperCase());
  }

  D.ui = {
    $(id) {
      return $(id);
    },

    setText(id, value) {
      const el = $(id);
      if (el) el.textContent = value;
    },

    showError(message) {
      const errorText = $("error-text");
      if (errorText) errorText.textContent = message;
      $("error")?.classList.remove("hidden");
    },

    hideError() {
      $("error")?.classList.add("hidden");
    },

    setLoading(active) {
      D.state.loading = active;
      const refreshButton = $("refresh");
      if (refreshButton) refreshButton.disabled = active;
      $("loading-tag")?.classList.toggle("hidden", !active || D.state.view !== "boards");
      $("pad-loading-tag")?.classList.toggle("hidden", !active || D.state.view !== "pads");
    },

    setStatus(connected) {
      const el = $("status");
      if (!el) return;
      el.textContent = connected ? "Connected" : "Disconnected";
      el.className = connected ? "status status-ok" : "status status-bad";
    },

    fillSelect(select, options, labelFn) {
      if (!select) return;
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
    },

    showBoardView() {
      D.state.view = "boards";
      $("board-panel")?.classList.remove("hidden");
      $("pad-panel")?.classList.add("hidden");
    },

    showPadView(serial) {
      D.state.view = "pads";
      D.state.selectedSerial = serial;
      this.setText("pad-serial-label", serial);
      $("board-panel")?.classList.add("hidden");
      $("pad-panel")?.classList.remove("hidden");
    },

    updateModeLabel(padCount, boardCount) {
      const labels = D.getTimeLabels();
      const range = labels[D.state.time] || D.state.time;
      const refresh = (D.config.refreshMs || 120000) / 1000;
      const prefix = D.config.environmentLabel || D.config.environment;
      const detailLabel = D.getDetailCountLabel();
      this.setText(
        "mode-label",
        `${prefix} · ${formatCount(boardCount)} boards · ${formatCount(padCount)} ${detailLabel} · ${range} · refresh ${refresh}s`
      );
    },

    updateBoardPager() {
      const { state } = D;
      this.setText(
        "board-page-info",
        `Page ${state.boardPage + 1} of ${state.boardTotalPages}`
      );
      const prev = $("board-prev");
      const next = $("board-next");
      if (prev) prev.disabled = state.boardPage <= 0 || state.loading;
      if (next) {
        next.disabled =
          state.boardPage + 1 >= state.boardTotalPages || state.loading;
      }
    },

    updatePadPager() {
      const { state } = D;
      this.setText(
        "pad-page-info",
        `Page ${state.padPage + 1} of ${state.padTotalPages}`
      );
      const prev = $("pad-prev");
      const next = $("pad-next");
      if (prev) prev.disabled = state.padPage <= 0 || state.loading;
      if (next) {
        next.disabled = state.padPage + 1 >= state.padTotalPages || state.loading;
      }
    },

    renderDataTable(theadId, tbodyId, columns, rows, options = {}) {
      const thead = $(theadId);
      const tbody = $(tbodyId);
      if (!thead || !tbody) return;

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
        td.textContent = D.state.loading
          ? "Loading…"
          : options.emptyText || "No records match the current filters.";
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
            btn.textContent = formatSerial(raw);
            btn.addEventListener("click", (e) => {
              e.stopPropagation();
              options.onSerialClick(raw);
            });
            td.appendChild(btn);
          } else if (col.type === "result") {
            td.innerHTML = resultPillHtml(raw);
          } else {
            td.textContent = formatTableCell(col, raw);
            if (col.key === "model" || col.key === "spi_pcb_name") {
              td.title = formatTableCell(col, raw);
            }
          }
          tr.appendChild(td);
        }

        if (options.clickable && options.onRowClick) {
          tr.addEventListener("click", () => options.onRowClick(row));
        }
        tbody.appendChild(tr);
      }
    },

    renderBoardTable(rows, onSerialClick, clickable = true) {
      const validRows = rows.filter((row) => row.serial && row.serial !== "—");
      this.renderDataTable("board-thead", "board-tbody", D.getBoardColumns(), validRows, {
        emptyText: "No boards match the current filters.",
        clickable,
        onSerialClick: clickable ? onSerialClick : undefined,
        onRowClick: clickable ? (row) => onSerialClick(row.serial) : undefined,
      });
    },

    renderPadTable(rows) {
      this.renderDataTable("pad-thead", "pad-tbody", D.getPadColumns(), rows, {
        emptyText: `No ${D.getDetailCountLabel()} found for this panel.`,
      });
    },

    renderParetoChart(counts) {
      const paretoDrillDown = D.hasFeature("paretoDrillDown");
      const items = Object.entries(counts)
        .filter(([, count]) => count > 0)
        .sort((a, b) => b[1] - a[1]);

      if (!items.length) {
        return '<p class="empty-note">No failures to analyze.</p>';
      }

      const total = items.reduce((sum, [, count]) => sum + count, 0);
      const maxCount = items[0][1] || 1;
      const barCount = items.length;
      const barWidth = Math.max(60, Math.floor(480 / barCount));
      const chartWidth = Math.min(1500, barCount * barWidth + 140);
      const chartHeight = 300;
      const padding = { left: 90, right: 70, top: 36, bottom: 100 };
      const innerWidth = chartWidth - padding.left - padding.right;
      const innerHeight = chartHeight - padding.top - padding.bottom;

      let cumulative = 0;
      const linePoints = items.map(([, count], index) => {
        cumulative += count;
        const x =
          padding.left +
          index * (innerWidth / barCount) +
          innerWidth / barCount / 2;
        const y = padding.top + innerHeight - (cumulative / total) * innerHeight;
        return { x, y, count, cumulative };
      });

      const linePath = linePoints
        .map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`)
        .join(" ");

      const yTicks = [0, 0.25, 0.5, 0.75, 1].map((fraction) => ({
        value: (fraction * 100).toFixed(0),
        y: padding.top + innerHeight - fraction * innerHeight,
      }));

      const grid = yTicks
        .map(
          (tick) => `
            <g class="pareto-grid-line">
              <line x1="${padding.left}" x2="${chartWidth - padding.right}" y1="${tick.y}" y2="${tick.y}" />
              <text x="${padding.left - 12}" y="${tick.y + 5}" text-anchor="end">${tick.value}%</text>
            </g>`
        )
        .join("");

      const bars = items
        .map(([key, count], index) => {
          const x = padding.left + index * (innerWidth / barCount) + 6;
          const columnWidth = innerWidth / barCount - 12;
          const height = (count / maxCount) * innerHeight;
          const y = padding.top + innerHeight - height;
          const words = titleCaseFailure(key).split(" ");
          const tspans = words
            .map(
              (word, i) =>
                `<tspan x="${x + columnWidth / 2}" dy="${i === 0 ? 0 : 16}">${word}</tspan>`
            )
            .join("");

          return `
            <g class="pareto-bar" data-failure="${key}" style="cursor:${paretoDrillDown ? "pointer" : "default"}">
              <rect x="${x}" y="${y}" width="${columnWidth}" height="${height}" fill="#074f89" rx="6" />
              <text x="${x + columnWidth / 2}" y="${padding.top + innerHeight + 25}" text-anchor="middle" class="pareto-bar-label">
                ${tspans}
              </text>
            </g>`;
        })
        .join("");

      const markers = linePoints
        .map(
          (point) => `
            <circle cx="${point.x}" cy="${point.y}" r="5" fill="#074f89" stroke="#fff" stroke-width="2" />
            <text x="${point.x}" y="${point.y - 12}" text-anchor="middle" class="pareto-line-label">${((point.cumulative / total) * 100).toFixed(0)}%</text>`
        )
        .join("");

      return `
        <div class="pareto-chart-card">
          <svg viewBox="0 0 ${chartWidth} ${chartHeight}" class="pareto-svg">
            <rect x="${padding.left}" y="${padding.top}" width="${innerWidth}" height="${innerHeight}" fill="none" stroke="rgba(148, 163, 184, 0.2)" />
            ${grid}
            ${bars}
            <path d="${linePath}" fill="none" stroke="#ffffff" stroke-width="3" />
            ${markers}
            <line x1="${padding.left}" x2="${padding.left}" y1="${padding.top}" y2="${padding.top + innerHeight}" stroke="rgba(148, 163, 184, 0.35)" />
            <line x1="${chartWidth - padding.right}" x2="${chartWidth - padding.right}" y1="${padding.top}" y2="${padding.top + innerHeight}" stroke="rgba(148, 163, 184, 0.35)" />
            <text x="${padding.left + innerWidth / 2}" y="${padding.top + innerHeight + 80}" text-anchor="middle" class="pareto-axis-label">Types of defects</text>
            <text x="${padding.left - 52}" y="${padding.top + innerHeight / 2}" transform="rotate(-90 ${padding.left - 52} ${padding.top + innerHeight / 2})" text-anchor="middle" class="pareto-axis-label">Frequency</text>
            <text x="${chartWidth - padding.right + 42}" y="${padding.top + innerHeight / 2}" transform="rotate(-90 ${chartWidth - padding.right + 42} ${padding.top + innerHeight / 2})" text-anchor="middle" class="pareto-axis-label">% of defects</text>
          </svg>
        </div>`;
    },

    updateParetoChart(counts) {
      const chart = $("pareto-chart");
      if (!chart) return;

      const hasFailures = Object.values(counts).some((value) => value > 0);
      if (!hasFailures) {
        chart.innerHTML =
          '<div class="pareto-empty"><p class="empty-note">No pad failures found for the current selection.</p></div>';
        return;
      }

      chart.innerHTML = this.renderParetoChart(counts);

      if (!D.hasFeature("paretoDrillDown")) return;

      chart.querySelectorAll(".pareto-bar").forEach((bar) => {
        bar.addEventListener("click", () => {
          const query = new URLSearchParams({
            time: D.state.time,
            line: D.state.line,
            model: D.state.model,
            failure: bar.dataset.failure,
          });
          window.location.href = `${D.pageUrl("padAnalysis")}?${query.toString()}`;
        });
      });
    },

    applyBoardKpis(boardAggRes) {
      const boardAggs = boardAggRes.aggregations ?? {};
      const boardCounts = D.countNormalizedResults(
        boardAggs.board_results?.buckets || [],
        (bucket) => bucket.doc_count ?? 0
      );

      const boardGood = boardCounts.good + boardCounts.pass;
      const boardFail = boardCounts.fail;
      const boardCount = boardGood + boardFail;
      const boardYield = boardCount > 0 ? (boardGood / boardCount) * 100 : 0;
      this._boardCount = boardCount;

      const boardCard = $("board-overview-content");
      if (boardCard) {
        boardCard.innerHTML = buildOverviewCard({
          goodCount: boardGood,
          passCount: 0,
          failCount: boardFail,
          stats: [
            { label: "Total", value: boardCount },
            { label: "Good", value: boardGood },
            { label: "Fail", value: boardFail },
            { label: "Yield", value: `${boardYield.toFixed(2)}%` },
          ],
        });
      }

      const boardOverview = $("board-overview-card");
      if (boardOverview) {
        const canOpen = D.hasFeature("boardAnalysis");
        boardOverview.classList.toggle("overview-card-clickable", canOpen);
        boardOverview.onclick = canOpen
          ? () => {
              const query = new URLSearchParams({
                time: D.state.time,
                line: D.state.line,
                model: D.state.model,
              });
              window.location.href = `${D.pageUrl("analysis")}?${query.toString()}`;
            }
          : null;
      }

      this.updateModeLabel(this._padTotal || 0, boardCount);
      this.setText("updated", `Updated ${formatTime(new Date())}`);
    },

    setPadKpisLoading() {
      const padCard = $("pad-overview-content");
      if (padCard) {
        padCard.innerHTML = '<p class="empty-note">Loading pad KPIs…</p>';
      }
      const chart = $("pareto-chart");
      if (chart) {
        chart.innerHTML = '<div class="pareto-empty"><p class="empty-note">Loading pad failures…</p></div>';
      }
    },

    applyPadKpisError(message) {
      const padCard = $("pad-overview-content");
      if (padCard) {
        padCard.innerHTML = `<p class="empty-note">${message}</p>`;
      }
      const chart = $("pareto-chart");
      if (chart) {
        chart.innerHTML = `<div class="pareto-empty"><p class="empty-note">${message}</p></div>`;
      }
    },

    applyPadKpis(padAggRes) {
      const padAggs = padAggRes.aggregations ?? {};
      const kpi = D.getKpi();
      const goodValues = new Set((kpi.good || ["GOOD"]).map((v) => String(v).toUpperCase()));
      const failValues = new Set((kpi.fail || []).map((v) => String(v).toUpperCase()));

      let good = padAggs.count_good?.doc_count ?? 0;
      let pass = padAggs.count_pass?.doc_count ?? 0;
      let fail = padAggs.count_fail?.doc_count ?? 0;
      let padFailureCounts =
        padAggs.pad_failure_types?.types?.buckets?.reduce((acc, bucket) => {
          acc[bucket.key] = bucket.doc_count;
          return acc;
        }, {}) || {};

      const termBuckets = padAggs.pad_results?.buckets;
      if (termBuckets) {
        good = 0;
        pass = 0;
        fail = 0;
        padFailureCounts = {};
        for (const bucket of termBuckets) {
          const key = String(bucket.key);
          const upper = key.toUpperCase();
          const count = bucket.doc_count || 0;
          if (goodValues.has(upper)) {
            good += count;
          } else if (failValues.has(upper)) {
            fail += count;
            padFailureCounts[key] = count;
          } else {
            pass += count;
          }
        }
      }

      const padTotal = good + pass + fail;
      const padYield = padTotal > 0 ? (good / padTotal) * 100 : 0;
      this._padTotal = padTotal;

      const padCard = $("pad-overview-content");
      if (padCard) {
        padCard.innerHTML = buildOverviewCard({
          goodCount: good,
          passCount: 0,
          failCount: fail,
          stats: [
            { label: D.getLabel("padTotal", "Total"), value: padTotal },
            { label: "Good", value: good },
            { label: "Fail", value: fail },
            { label: "Yield", value: `${padYield.toFixed(2)}%` },
          ],
        });
      }

      const padOverview = $("pad-overview-card");
      if (padOverview) {
        const canOpen = D.hasFeature("padAnalysis");
        padOverview.classList.toggle("overview-card-clickable", canOpen);
        padOverview.onclick = canOpen
          ? () => {
              const query = new URLSearchParams({
                time: D.state.time,
                line: D.state.line,
                model: D.state.model,
                view: "pad",
              });
              window.location.href = `${D.pageUrl("analysis")}?${query.toString()}`;
            }
          : null;
      }

      this.updateModeLabel(padTotal, this._boardCount || 0);
      this.setText("updated", `Updated ${formatTime(new Date())}`);
      this.updateParetoChart(padFailureCounts);
    },
  };

  D.transform = {
    resolveBoardSerial(bucket) {
      const topHit = bucket.latest_doc?.hits?.hits?.[0]?._source || {};
      const serialFields =
        D.getKpi().boardSerialSourceFields ||
        D.getKpi().serialSourceFields ||
        [];

      for (const field of serialFields) {
        if (topHit[field] != null && String(topHit[field]).trim()) {
          return formatSerial(topHit[field]);
        }
      }

      if (bucket.key?.board != null) {
        return formatSerial(bucket.key.board);
      }
      return "—";
    },

    boardBucketToRow(bucket) {
      const boardFields = D.getBoardFields();
      const topHit = bucket.latest_doc?.hits?.hits?.[0]?._source || {};
      const resultField =
        D.getKpi().boardResultField?.replace(/\.keyword$/, "") || "pcb_result";
      const latest = topHit[boardFields.time] ?? topHit.timestamp;
      const topResult = topHit[resultField] ?? topHit.pcb_result;
      const normalized = D.normalizeResult(topResult);

      let result = "PASS";
      if (normalized === "GOOD") result = "GOOD";
      else if (normalized === "FAIL") result = "FAIL";

      return {
        serial: D.transform.resolveBoardSerial(bucket),
        model: topHit[boardFields.model] ?? null,
        line: topHit[boardFields.line] ?? null,
        machine: topHit[boardFields.machine] ?? topHit.machine ?? null,
        timestamp:
          latest == null
            ? null
            : typeof latest === "number"
              ? new Date(latest).toISOString()
              : latest,
        pad_count: bucket.pad_count?.value ?? bucket.doc_count ?? 0,
        result,
      };
    },

    hitToPadRow(hit) {
      const fields = D.getFields();
      const source = hit._source ?? {};
      const row = {
        timestamp: source[fields.time] ?? source.timestamp ?? null,
      };

      for (const col of D.getPadColumns()) {
        if (col.key === "timestamp") continue;
        row[col.key] = source[col.source || col.key] ?? null;
      }
      return row;
    },
  };
})(window.Dashboard);
