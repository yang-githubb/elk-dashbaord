/**
 * Elasticsearch query builders.
 *
 * Board queries use spi-board fields (native keyword).
 * Pad / detail queries use jax fields (text + .keyword).
 */
(function (D) {
  function emptyTermsAgg() {
    return { terms: { field: "_id", size: 0 } };
  }

  D.esQueries = {
    isAllTime() {
      return D.state.time === "all";
    },

    // ---- Field helpers -------------------------------------------------

    boardSourceFileField() {
      return D.getKpi().boardSourceFileField || "source_file";
    },

    padNoField() {
      return D.getKpi().boardCountField || "spi_pad_no";
    },

    boardResultField() {
      const kpi = D.getKpi();
      return kpi.boardResultField || kpi.resultField || "pcb_result";
    },

    padResultField() {
      const kpi = D.getKpi();
      const field =
        kpi.componentResultField ||
        kpi.padResultField ||
        "spi_pad_result.keyword";
      return field.includes(".") ? field : `${field}.keyword`;
    },

    padFailValues() {
      const kpi = D.getKpi();
      return kpi.fail || kpi.padFailResults || [];
    },

    // ---- Filters -------------------------------------------------------

    pushTimeFilter(filters, timeField) {
      if (this.isAllTime() || !timeField) return;
      const gte = (D.config.esTimeRanges || {})[D.state.time];
      if (gte) {
        filters.push({ range: { [timeField]: { gte } } });
      }
    },

    pushTerm(filters, field, value) {
      if (field && value) {
        filters.push({ term: { [field]: value } });
      }
    },

    /** Filters for the board index (spi-board). */
    buildBoardFilters() {
      const fields = D.getBoardFields();
      const filters = [];

      this.pushTimeFilter(filters, fields.time);
      this.pushTerm(filters, D.esBoardField(fields.line), D.state.line);
      this.pushTerm(filters, D.esBoardField(fields.model), D.state.model);
      this.pushTerm(
        filters,
        D.esBoardField(fields.station) || "station",
        D.config.stationValue
      );

      return filters;
    },

    /** Filters for the detail / pad index (jax optimizations). */
    buildEsFilters() {
      const fields = D.getFields();
      const kpi = D.getKpi();
      const filters = [];

      this.pushTimeFilter(filters, fields.time);
      this.pushTerm(filters, D.esField(fields.line), D.state.line);
      this.pushTerm(filters, D.esField(fields.model), D.state.model);
      this.pushTerm(filters, D.esField(fields.station), D.config.stationValue);

      const serialField = D.esField(fields.serial);
      if (D.state.boardSearch?.trim() && serialField) {
        filters.push({
          prefix: { [serialField]: D.state.boardSearch.trim() },
        });
      }

      if (kpi.requireSerialField) {
        filters.push({ exists: { field: kpi.requireSerialField } });
      }
      if (kpi.excludeEmptySerial !== false && kpi.serialField) {
        filters.push({
          bool: { must_not: [{ term: { [kpi.serialField]: "" } }] },
        });
      }
      if (kpi.excludeLeadingUnderscoreSource) {
        filters.push({
          bool: { must_not: [{ prefix: { "source_file.keyword": "_" } }] },
        });
      }

      return filters;
    },

    /** Pad rows for one board serial (spi_array_barcode). */
    buildPadFilters(serial) {
      const detailField = D.getKpi().serialField || "spi_array_barcode.keyword";
      const filters = [...this.buildEsFilters()];
      if (detailField && serial) {
        filters.push({ term: { [detailField]: serial } });
      }
      return filters;
    },

    buildEsQuery(filters) {
      return filters.length ? { bool: { filter: filters } } : { match_all: {} };
    },

    buildTermsFilter(field, values) {
      const terms = Array.isArray(values)
        ? values
        : values == null
          ? []
          : [values];

      if (!field || !terms.length) {
        return { match_none: {} };
      }
      return { terms: { [field]: terms } };
    },

    // ---- Dashboard aggregations ----------------------------------------

    buildBoardDashboardAggs() {
      return {
        board_results: {
          terms: { field: this.boardResultField(), size: 10 },
          aggs: {
            inspections: {
              cardinality: { field: this.boardSourceFileField() },
            },
          },
        },
      };
    },

    buildPadDashboardAggs() {
      const kpi = D.getKpi();
      const resultField = this.padResultField();
      const failValues = this.padFailValues();

      return {
        total_count: { value_count: { field: resultField } },
        count_good: {
          filter: this.buildTermsFilter(resultField, kpi.good || ["GOOD"]),
        },
        count_pass: {
          filter: this.buildTermsFilter(resultField, kpi.pass || []),
        },
        count_fail: {
          filter: this.buildTermsFilter(resultField, failValues),
        },
        pad_failure_types: {
          filter: this.buildTermsFilter(resultField, failValues),
          aggs: {
            types: {
              terms: { field: resultField, size: 25, order: { _count: "desc" } },
            },
          },
        },
      };
    },

    boardBreakdownAgg() {
      return {
        board_results: {
          terms: { field: this.boardResultField(), size: 10 },
          aggs: {
            inspections: {
              value_count: { field: this.boardSourceFileField() },
            },
          },
        },
      };
    },

    buildBoardAnalysisAggs() {
      const fields = D.getBoardFields();
      const lineField = D.esBoardField(fields.line);
      const modelField = D.esBoardField(fields.model);
      const breakdown = this.boardBreakdownAgg();

      return {
        lines: lineField
          ? { terms: { field: lineField, size: 100 }, aggs: breakdown }
          : emptyTermsAgg(),
        models: modelField
          ? { terms: { field: modelField, size: 200 }, aggs: breakdown }
          : emptyTermsAgg(),
      };
    },

    /** Composite aggregation: one bucket per array_barcode. */
    buildBoardListAgg(afterKey = null) {
      const boardFields = D.getBoardFields();
      const kpi = D.getKpi();
      const boardGroupField = String(kpi.boardSerialField || "array_barcode").trim();
      const boardResultSource = String(this.boardResultField() || "pcb_result")
        .replace(/\.keyword$/, "");

      const sourceFields = [
        boardFields.line,
        boardFields.model,
        boardFields.serial,
        boardFields.time,
        boardFields.machine,
        boardResultSource,
      ].filter(Boolean);

      const agg = {
        size: 0,
        query: this.buildEsQuery(this.buildBoardFilters()),
        aggs: {
          boards: {
            composite: {
              size: D.config.pageSize,
              sources: [{ board: { terms: { field: boardGroupField } } }],
            },
            aggs: {
              latest_doc: {
                top_hits: {
                  size: 1,
                  sort: [{ [boardFields.time]: { order: "desc", unmapped_type: "date" } }],
                  _source: sourceFields,
                },
              },
            },
          },
        },
      };

      if (afterKey) {
        agg.aggs.boards.composite.after = afterKey;
      }

      return agg;
    },
  };
})(window.Dashboard);
