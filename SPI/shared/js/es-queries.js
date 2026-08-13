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

  const LINE_TERMS_SIZE = 200;
  const MODEL_TERMS_SIZE = 10000;

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

      const serialField = D.esBoardField(fields.serial) || "array_barcode";
      if (D.state.boardSearch?.trim() && serialField) {
        filters.push({
          prefix: { [serialField]: D.state.boardSearch.trim() },
        });
      }

      return filters;
    },

    /** Filters for the detail / pad index (jax optimizations). */
    buildEsFilters(options = {}) {
      const fields = D.getFields();
      const kpi = D.getKpi();
      const filters = [];

      this.pushTimeFilter(filters, fields.time);
      this.pushTerm(filters, D.esField(fields.line), D.state.line);
      this.pushTerm(filters, D.esField(fields.model), D.state.model);
      this.pushTerm(filters, D.esField(fields.station), D.config.stationValue);

      const serialField = D.esField(fields.serial);
      if (!options.skipSerialSearch && D.state.boardSearch?.trim() && serialField) {
        filters.push({
          prefix: { [serialField]: D.state.boardSearch.trim() },
        });
      }

      if (!options.lite) {
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
          terms: {
            field: this.boardResultField(),
            size: 10,
            execution_hint: "map",
          },
        },
      };
    },

    padResultTermsAgg() {
      return {
        pad_results: {
          terms: {
            field: this.padResultField(),
            size: 40,
            execution_hint: "map",
          },
        },
      };
    },

    buildPadDashboardAggs() {
      return this.padResultTermsAgg();
    },

    boardBreakdownAgg() {
      return {
        board_results: {
          terms: {
            field: this.boardResultField(),
            size: 10,
            execution_hint: "map",
          },
        },
      };
    },

    buildPadAnalysisAggs() {
      const fields = D.getFields();
      const lineField = D.esField(fields.line);
      const modelField = D.esField(fields.model);
      const resultField = this.padResultField();
      const kpi = D.getKpi();
      const breakdown = {
        count_good: {
          filter: this.buildTermsFilter(resultField, kpi.good || ["GOOD"]),
        },
        count_fail: {
          filter: this.buildTermsFilter(resultField, this.padFailValues()),
        },
      };

      return {
        lines: lineField
          ? {
              terms: {
                field: lineField,
                size: LINE_TERMS_SIZE,
                execution_hint: "map",
              },
              aggs: breakdown,
            }
          : emptyTermsAgg(),
        models: modelField
          ? {
              terms: {
                field: modelField,
                size: MODEL_TERMS_SIZE,
                order: { _count: "desc" },
              },
              aggs: breakdown,
            }
          : emptyTermsAgg(),
      };
    },

    buildBoardAnalysisAggs() {
      const fields = D.getBoardFields();
      const lineField = D.esBoardField(fields.line);
      const modelField = D.esBoardField(fields.model);
      const breakdown = this.boardBreakdownAgg();

      return {
        lines: lineField
          ? {
              terms: {
                field: lineField,
                size: LINE_TERMS_SIZE,
                execution_hint: "map",
              },
              aggs: breakdown,
            }
          : emptyTermsAgg(),
        models: modelField
          ? {
              terms: {
                field: modelField,
                size: MODEL_TERMS_SIZE,
                order: { _count: "desc" },
              },
              aggs: breakdown,
            }
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
