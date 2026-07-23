/** Charts, tables, and KPI rendering */
(function (D) {
  const $ = (id) => document.getElementById(id);

  function cellValue(value) {
    if (value == null) return "—";
    if (typeof value === "object") return JSON.stringify(value);
    return String(value);
  }

  function formatCount(value) {
    const n = Number(value);
    if (Number.isNaN(n)) return cellValue(value);
    return n.toLocaleString();
  }

  function formatSerial(value) {
    if (value == null) return "—";
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

  function pieHtml(counts, keys, labels, size, colors) {
    const items = keys
      .filter((k) => counts[k] > 0)
      .map((k) => ({ key: k, count: counts[k], label: labels[k] || k, color: colors[k] }));

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
        return `<li><span class="legend-dot" style="background:${i.color}"></span>${i.label} <strong>${formatCount(i.count)}</strong> (${p}%)</li>`;
      })
      .join("");

    return `
      <div class="pie-card pie-${size}">
        <div class="pie" style="background:conic-gradient(${gradient})"></div>
        <ul class="pie-legend">${legend}</ul>
      </div>
    `;
  }

  function buildPieSvg(percent, color) {

    const good = Math.max(0, Math.min(100, percent));
    const bad = 100 - good;

    return `
        <div class="pie-chart-container">
            <div
                class="pie-chart"
                style="
                    background:
                    conic-gradient(
                        ${color} 0% ${good}%,
                        rgba(255,255,255,0.12) ${good}% 100%
                    );
                "
            ></div>
        </div>
    `;
  }
  
  function buildOverviewCard({
    title,
    yieldValue,
    yieldColor,
    stats,
  }) {
    return `
    <div class="overview-body">

      <!-- Left Side -->
      <div class="overview-left">

        <div class="overview-yield-block">

          <div
            class="overview-yield"
            style="color:${yieldColor};"
          >
            ${yieldValue.toFixed(2)}%
          </div>

          <div class="overview-subtitle">
            Yield
          </div>

        </div>

        <div class="overview-donut-wrap">
          ${buildDonutSvg(yieldValue, yieldColor)}
        </div>

      </div>

      <!-- Right Side -->
      <div class="overview-stats">

        ${stats
        .map(
          (stat) => `
              <div class="overview-stat">

                <span class="overview-stat-label">
                  ${stat.label}
                </span>

                <span class="overview-stat-value">
                  ${formatCount(stat.value)}
                </span>

              </div>
            `
        )
        .join("")}

      </div>

    </div>
  `;
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
      $("error-text").textContent = message;
      $("error").classList.remove("hidden");
    },

    hideError() {
      $("error").classList.add("hidden");
    },

    setLoading(active) {
      const { state, config } = D;
      state.loading = active;
      $("refresh").disabled = active;
      $("loading-tag").classList.toggle("hidden", !active || state.view !== "boards");
      $("pad-loading-tag").classList.toggle("hidden", !active || state.view !== "pads");
    },

    setStatus(connected) {
      const el = $("status");
      el.textContent = connected ? "Connected" : "Disconnected";
      el.className = connected ? "status status-ok" : "status status-bad";
    },

    fillSelect(select, options, labelFn) {
      const current = select.value;
      select.innerHTML = "";
      for (const opt of options) {
        const el = document.createElement("option");
        el.value = opt.value;
        el.textContent = labelFn ? labelFn(opt) : opt.label;
        select.appendChild(el);
      }
      if ([...select.options].some((o) => o.value === current)) select.value = current;
    },

    showBoardView() {
      D.state.view = "boards";
      $("board-panel").classList.remove("hidden");
      $("pad-panel").classList.add("hidden");
    },

    showPadView(serial) {
      D.state.view = "pads";
      D.state.selectedSerial = serial;
      this.setText("pad-serial-label", serial);
      $("board-panel").classList.add("hidden");
      $("pad-panel").classList.remove("hidden");
    },

    updateModeSettings() {
      const detailLabel = D.getDetailCountLabel();
      const mode = D.config.environmentLabel || D.config.environment;

      this._modePrefix = mode;
      this._detailCountLabel = detailLabel;
    },

    updateModeLabel(padCount, boardCount) {
      const labels = D.getTimeLabels();
      const range = labels[D.state.time] || D.state.time;
      const refresh = (D.config.refreshMs || 120000) / 1000;
      const prefix =
        this._modePrefix ||
        (D.config.environmentLabel || D.config.environment);

      const detailLabel =
        this._detailCountLabel ||
        D.getDetailCountLabel();
      this.setText("mode-label", `${prefix} · ${formatCount(boardCount)} boards · ${formatCount(padCount)} ${detailLabel} · ${range} · refresh ${refresh}s`);
    },

    updateBoardPager() {
      const { state } = D;
      this.setText("board-page-info", `Page ${state.boardPage + 1} of ${state.boardTotalPages}`);
      $("board-prev").disabled = state.boardPage <= 0 || state.loading;
      $("board-next").disabled = state.boardPage + 1 >= state.boardTotalPages || state.loading;
    },

    updatePadPager() {
      const { state } = D;
      this.setText("pad-page-info", `Page ${state.padPage + 1} of ${state.padTotalPages}`);
      $("pad-prev").disabled = state.padPage <= 0 || state.loading;
      $("pad-next").disabled = state.padPage + 1 >= state.padTotalPages || state.loading;
    },

    renderDataTable(theadId, tbodyId, columns, rows, options = {}) {
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
        td.textContent = D.state.loading ? "Loading…" : (options.emptyText || "No records match the current filters.");
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
            if (col.key === "model") td.title = formatTableCell(col, raw);
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

    setParetoPanelVisible(visible) {
      const panel = $("pareto-panel");
      const button = $("pareto-toggle");
      if (panel) panel.classList.toggle("hidden", !visible);
      if (button) button.textContent = visible ? "Hide Failure Pareto" : "View Failure Pareto";
    },

    renderParetoChart(counts) {
      const colors = D.getResultColors();
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
      const chartWidth = Math.min(960, barCount * barWidth + 140);
      const chartHeight = 300;
      const padding = { left: 90, right: 70, top: 36, bottom: 110 };
      const innerWidth = chartWidth - padding.left - padding.right;
      const innerHeight = chartHeight - padding.top - padding.bottom;

      let cumulative = 0;
      const linePoints = items.map(([key, count], index) => {
        cumulative += count;
        const x = padding.left + index * (innerWidth / barCount) + (innerWidth / barCount) / 2;
        const y = padding.top + innerHeight - (cumulative / total) * innerHeight;
        return { x, y, key, count, cumulative };
      });

      const linePath = linePoints
        .map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`)
        .join(" ");

      const yTicks = [0, 0.25, 0.5, 0.75, 1].map((fraction) => ({
        value: (fraction * 100).toFixed(0),
        y: padding.top + innerHeight - fraction * innerHeight,
      }));

      const xLabelAngle = barCount > 6 ? -45 : 0;

      return `
        <div class="pareto-chart-card">
          <svg viewBox="0 0 ${chartWidth} ${chartHeight}" class="pareto-svg">
            <defs>
              <linearGradient id="pareto-line-gradient" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stop-color="#f59e0b" />
                <stop offset="100%" stop-color="#eab308" />
              </linearGradient>
            </defs>
            <rect x="${padding.left}" y="${padding.top}" width="${innerWidth}" height="${innerHeight}" fill="none" stroke="rgba(148, 163, 184, 0.2)" />
            ${yTicks
          .map(
            (tick) => `
              <g class="pareto-grid-line">
                <line x1="${padding.left}" x2="${chartWidth - padding.right}" y1="${tick.y}" y2="${tick.y}" />
                <text x="${padding.left - 12}" y="${tick.y + 5}" text-anchor="end">${tick.value}%</text>
              </g>
            `
          )
          .join("")}
            ${items
          .map(([key, count], index) => {
            const x = padding.left + index * (innerWidth / barCount) + 6;
            const columnWidth = innerWidth / barCount - 12;
            const height = (count / maxCount) * innerHeight;
            const y = padding.top + innerHeight - height;
            const fill = colors[key] || colors.FAIL || "#ef4444";

            return `
    <g
        class="pareto-bar"
        data-failure="${key}"
        style="cursor:pointer"
    >
                <rect
                    x="${x}"
                    y="${y}"
                    width="${columnWidth}"
                    height="${height}"
                    fill="${fill}"
                    rx="6"
                />
                <text
                    x="${x + columnWidth / 2}"
                    y="${y - 10}"
                    text-anchor="middle"
                    class="pareto-bar-value"
                >
                    ${formatCount(count)}
                </text>
                <text
                    x="${x + columnWidth / 2}"
                    y="${padding.top + innerHeight + 28}"
                    text-anchor="middle"
                    class="pareto-bar-label"
                    transform="rotate(${xLabelAngle} ${x + columnWidth / 2} ${padding.top + innerHeight + 28})"
                >
                    ${key}
                </text>
            </g>
        `;
          })
          .join("")}
            <path d="${linePath}" fill="none" stroke="url(#pareto-line-gradient)" stroke-width="3" />
            ${linePoints
          .map(
            (point) => `
              <circle cx="${point.x}" cy="${point.y}" r="5" fill="#f59e0b" stroke="#fff" stroke-width="2" />
              <text x="${point.x}" y="${point.y - 12}" text-anchor="middle" class="pareto-line-label">${((point.cumulative / total) * 100).toFixed(0)}%</text>
            `
          )
          .join("")}
            <line x1="${padding.left}" x2="${padding.left}" y1="${padding.top}" y2="${padding.top + innerHeight}" stroke="rgba(148, 163, 184, 0.35)" />
            <line x1="${chartWidth - padding.right}" x2="${chartWidth - padding.right}" y1="${padding.top}" y2="${padding.top + innerHeight}" stroke="rgba(148, 163, 184, 0.35)" />
            <text x="${padding.left + innerWidth / 2}" y="${chartHeight - 18}" text-anchor="middle" class="pareto-axis-label">Types of defects</text>
            <text x="${padding.left - 52}" y="${padding.top + innerHeight / 2}" transform="rotate(-90 ${padding.left - 52} ${padding.top + innerHeight / 2})" text-anchor="middle" class="pareto-axis-label">Frequency</text>
            <text x="${chartWidth - padding.right + 42}" y="${padding.top + innerHeight / 2}" transform="rotate(-90 ${chartWidth - padding.right + 42} ${padding.top + innerHeight / 2})" text-anchor="middle" class="pareto-axis-label">% of defects</text>
          </svg>
        </div>
      `;
    },

    updateParetoChart(counts) {
      const button = $("pareto-toggle");
      const chart = $("pareto-chart");
      const panel = $("pareto-panel");
      if (!button || !chart) return;

      const hasFailures = Object.values(counts).some((value) => value > 0);
      button.classList.toggle("hidden", !hasFailures);

      if (!hasFailures) {
        chart.innerHTML = '<p class="empty-note">No pad failures found for the current selection.</p>';
        this.setParetoPanelVisible(false);
        return;
      }

      chart.innerHTML = this.renderParetoChart(counts);

      chart
        .querySelectorAll(".pareto-bar")
        .forEach(bar => {

          bar.addEventListener("click", () => {

            const failure =
              bar.dataset.failure;

            console.log(
              "Pareto Click:",
              failure
            );

            const query =
              new URLSearchParams({
                time: D.state.time,
                line: D.state.line,
                model: D.state.model,
                failure
              });

            window.location.href =
              `pad-analysis.html?${query.toString()}`;

          });

        }); if (panel && !panel.classList.contains("hidden")) {
          this.setParetoPanelVisible(true);
        }
    },

    applyKpis(aggRes, padFailureCounts = {}) {

      const aggs = aggRes.aggregations ?? {};

      const good =
        aggs.count_good?.doc_count ?? 0;

      const pass =
        aggs.count_pass?.doc_count ?? 0;

      const fail =
        aggs.count_fail?.doc_count ?? 0;

      const total =
        good + pass + fail;

      const padYield =
        total > 0
          ? (good / total) * 100
          : 0;

      let boardGood = 0;
      let boardPass = 0;
      let boardFail = 0;

      const boardBuckets =
        aggs.board_results?.buckets || [];

      for (const bucket of boardBuckets) {

        const result = bucket.key;

        const count =
          bucket.inspections?.value ?? 0;

        if (result === "GOOD") {

          boardGood += count;

        } else if (
          result === "WARNING" ||
          result === "PASS"
        ) {

          boardPass += count;

        } else if (result === "NG") {

          boardFail += count;
        }
      }

      const boardCount =
        boardGood +
        boardPass +
        boardFail;

      const boardYield =
        boardCount > 0
          ? (boardGood / boardCount) * 100
          : 0;

      const boardCard =
        $("board-overview-content");

      const padCard =
        $("pad-overview-content");

      const boardYieldColor =
        boardYield >= 95
          ? "#22c55e"
          : "#ef4444";

      const padYieldColor =
        padYield >= 95
          ? "#22c55e"
          : "#ef4444";

      boardCard.innerHTML =
        buildOverviewCard({
          title: "Board Overview",
          yieldValue: boardYield,
          yieldColor: boardYieldColor,
          stats: [
            {
              label: "Total",
              value: boardCount
            },
            {
              label: "Good",
              value: boardGood
            },
            {
              label: "Pass",
              value: boardPass
            },
            {
              label: "Fail",
              value: boardFail
            }
          ]
        });

      padCard.innerHTML =
        buildOverviewCard({
          title: "Pad Overview",
          yieldValue: padYield,
          yieldColor: padYieldColor,
          stats: [
            {
              label: "Total",
              value: total
            },
            {
              label: "Good",
              value: good
            },
            {
              label: "Fail",
              value: fail
            }
          ]
        });
      this.updateParetoChart(padFailureCounts);

      const boardOverview =
        $("board-overview-card");

      if (boardOverview) {

        boardOverview.onclick = () => {

          const query =
            new URLSearchParams({
              time: D.state.time,
              line: D.state.line,
              model: D.state.model
            });

          window.location.href =
            `analysis.html?${query.toString()}`;
        };
      }

      const padOverview =
        $("pad-overview-card");

      if (padOverview) {

        padOverview.onclick = () => {

          const query =
            new URLSearchParams({
              time: D.state.time,
              line: D.state.line,
              model: D.state.model
            });

          window.location.href =
            `pad-analysis.html?${query.toString()}`;
        };
      }

      // =========================
      // FOOTER
      // =========================

      this.updateModeLabel(
        total,
        boardCount
      );

      this.setText(
        "updated",
        `Updated ${formatTime(new Date())}`
      );
    },
  }
  D.transform = {
    barcodeFromPath(path) {
      if (!path) return null;

      const s = String(path).replace(/^\//, "");

      const lead = s.match(/^([A-Za-z0-9]+)_\d{14}/);

      return lead ? lead[1] : null;
    },

    resolveBoardSerial(bucket) {

      const barcode =
        bucket.top_barcode?.buckets?.[0]?.key;

      if (
        barcode != null &&
        String(barcode).trim()
      ) {
        return formatSerial(barcode);
      }

      return "—";
    },

    boardBucketToRow(bucket) {

      const latest =
        bucket.latest?.value;

      const topResult =
        bucket.top_result?.buckets?.[0]?.key;

      const machine =
        bucket.top_machine?.buckets?.[0]?.key ??
        null;

      let result;

      if (
        topResult === "GOOD" ||
        topResult === "PASS"
      ) {

        result = "GOOD";

      } else if (
        topResult === "WARNING"
      ) {

        result = "PASS";

      } else if (
        topResult === "NG"
      ) {

        result = "FAIL";

      } else {

        result = "PASS";
      }

      return {
        serial:
          D.transform.resolveBoardSerial(bucket),

        model:
          bucket.top_model?.buckets?.[0]?.key ??
          null,

        line:
          bucket.top_line?.buckets?.[0]?.key ??
          null,

        machine,

        timestamp:
          latest != null
            ? (
              typeof latest === "number"
                ? new Date(latest).toISOString()
                : latest
            )
            : null,

        pad_count:
          bucket.pad_count?.value ??
          bucket.doc_count ??
          0,

        result
      };
    },

    hitToPadRow(hit) {
      const fields = D.getFields();
      const s = hit._source ?? {};
      const ts = s[fields.time] ?? s.timestamp;
      const row = { timestamp: ts ?? null };

      for (const col of D.getPadColumns()) {
        if (col.key === "timestamp") continue;
        const srcKey = col.source || col.key;
        row[col.key] = s[srcKey] ?? null;
      }

      return row;
    },
  };
})(window.Dashboard);
