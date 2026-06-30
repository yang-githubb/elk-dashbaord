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

    updateStationLabels() {
      const detailLabel = D.getDetailCountLabel();
      const mode = D.config.environmentLabel || D.config.environment;
      const station = D.config.schemaLabel || D.state.station;
      this._modePrefix = `${mode} · ${station}`;
      this._detailCountLabel = detailLabel;
    },

    updateModeLabel(padCount, boardCount) {
      const labels = D.getTimeLabels();
      const range = labels[D.state.time] || D.state.time;
      const refresh = (D.config.refreshMs || 120000) / 1000;
      const prefix = this._modePrefix || `${D.config.environmentLabel || D.config.environment} · ${D.config.schemaLabel || D.state.station}`;
      const detailLabel = this._detailCountLabel || D.getDetailCountLabel();
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
      this.renderDataTable("board-thead", "board-tbody", D.getBoardColumns(), rows, {
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

    applyKpis(aggRes, boardKpi) {
      const aggs = aggRes.aggregations ?? {};
      const good = aggs.count_good?.doc_count ?? 0;
      const pass = aggs.count_pass?.doc_count ?? 0;
      const fail = aggs.count_fail?.doc_count ?? 0;
      const total = good + pass + fail;
      const padYield = total ? ((good + pass) / total) * 100 : 0;
      const colors = D.getResultColors();

      this.setText("kpi-board-count", boardKpi.boardCount.toLocaleString());
      this.setText("kpi-board-pass", boardKpi.boardPass.toLocaleString());
      this.setText("kpi-board-fail", boardKpi.boardFail.toLocaleString());
      this.setText("kpi-board-yield", `${boardKpi.boardYield.toFixed(2)}%`);

      this.setText("kpi-pad-count", total.toLocaleString());
      this.setText("kpi-pad-pass", pass.toLocaleString());
      this.setText("kpi-pad-fail", fail.toLocaleString());
      this.setText("kpi-pad-yield", `${padYield.toFixed(2)}%`);

      const boardEl = $("chart-board");
      const padEl = $("chart-pad");
      const boardCounts = { PASS: boardKpi.boardPass, FAIL: boardKpi.boardFail };
      const padCounts = { GOOD: good, PASS: pass, FAIL: fail };

      boardEl.innerHTML = Object.values(boardCounts).some((v) => v > 0)
        ? `<div class="pie-center">${pieHtml(boardCounts, ["PASS", "FAIL"], { PASS: "Pass", FAIL: "Fail" }, "lg", colors)}</div>`
        : '<p class="empty-note">No data for selected filters.</p>';

      padEl.innerHTML = Object.values(padCounts).some((v) => v > 0)
        ? `<div class="pie-center">${pieHtml(padCounts, ["GOOD", "PASS", "FAIL"], { GOOD: "Good", PASS: "Pass", FAIL: "Fail" }, "lg", colors)}</div>`
        : '<p class="empty-note">No data for selected filters.</p>';

      this.updateModeLabel(total, boardKpi.boardCount);
      this.setText("updated", `Updated ${formatTime(new Date())}`);
    },
  };

  D.transform = {
    boardBucketToRow(bucket) {
      const hasNg = (bucket.has_ng?.doc_count ?? 0) > 0;
      const latest = bucket.latest?.value;
      const topResult = bucket.top_result?.buckets?.[0]?.key;
      return {
        serial: formatSerial(bucket.key.board),
        model: bucket.top_model?.buckets?.[0]?.key ?? null,
        line: bucket.top_line?.buckets?.[0]?.key ?? null,
        machine: bucket.top_machine?.buckets?.[0]?.key ?? null,
        timestamp: latest != null ? (typeof latest === "number" ? new Date(latest).toISOString() : latest) : null,
        pad_count: bucket.pad_count?.value ?? bucket.doc_count ?? 0,
        result: topResult != null ? D.normalizeResult(topResult) : hasNg ? "FAIL" : "PASS",
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
