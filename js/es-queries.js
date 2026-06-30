/** Elasticsearch query builders */
(function (D) {
  D.esQueries = {
    isAllTime() {
      return D.state.time === "all";
    },

    buildEsFilters() {
      const fields = D.getFields();
      const filters = [];
      const timeRanges = D.config.esTimeRanges || {};

      if (!this.isAllTime()) {
        filters.push({ range: { [fields.time]: { gte: timeRanges[D.state.time] } } });
      }
      if (D.state.line) filters.push({ term: { [D.esField(fields.line)]: D.state.line } });
      if (D.state.model) filters.push({ term: { [D.esField(fields.model)]: D.state.model } });
      filters.push({ term: { [D.esField(fields.station)]: D.state.station } });

      const kpi = D.getKpi();
      if (kpi.requireSerialField) {
        filters.push({ exists: { field: kpi.requireSerialField } });
      }
      if (kpi.excludeEmptySerial !== false && kpi.serialField) {
        filters.push({ bool: { must_not: [{ term: { [kpi.serialField]: "" } }] } });
      }
      if (kpi.excludeLeadingUnderscoreSource) {
        filters.push({ bool: { must_not: [{ prefix: { "source_file.keyword": "_" } }] } });
      }
      return filters;
    },

    buildPadFilters(serial) {
      const fields = D.getFields();
      return [...this.buildEsFilters(), { term: { [D.esField(fields.serial)]: serial } }];
    },

    buildEsQuery(filters) {
      return filters.length ? { bool: { filter: filters } } : { match_all: {} };
    },

    buildDashboardAggs() {
      const kpi = D.getKpi();
      const rf = kpi.componentResultField || kpi.resultField || "pcb_result.keyword";
      return {
        total_count: { value_count: { field: rf } },
        total_boards: { cardinality: { field: kpi.serialField || "array_barcode.keyword" } },
        count_good: { filter: { terms: { [rf]: kpi.good || ["GOOD"] } } },
        count_pass: { filter: { terms: { [rf]: kpi.pass || ["PASS", "WARNING"] } } },
        count_fail: { filter: { terms: { [rf]: kpi.fail || ["NG"] } } },
      };
    },

    boardResultField() {
      const kpi = D.getKpi();
      return kpi.boardResultField || kpi.resultField || "pcb_result.keyword";
    },

    boardFailField() {
      const kpi = D.getKpi();
      return (
        kpi.boardFailField ||
        kpi.componentResultField ||
        kpi.boardResultField ||
        kpi.resultField ||
        "pcb_result.keyword"
      );
    },

    boardFailValues() {
      const kpi = D.getKpi();
      return kpi.boardFail || kpi.fail || ["NG"];
    },

    buildBoardKpiAgg(afterKey = null) {
      const kpi = D.getKpi();
      const failField = this.boardFailField();
      const failValues = this.boardFailValues();
      const agg = {
        size: 0,
        query: this.buildEsQuery(this.buildEsFilters()),
        aggs: {
          boards: {
            composite: {
              size: D.config.compositePageSize,
              sources: [{ board: { terms: { field: kpi.serialField || "array_barcode.keyword" } } }],
            },
            aggs: {
              has_ng: { filter: { terms: { [failField]: failValues } } },
            },
          },
        },
      };
      if (afterKey) agg.aggs.boards.composite.after = afterKey;
      return agg;
    },

    buildBoardListAgg(afterKey = null) {
      const fields = D.getFields();
      const kpi = D.getKpi();
      const failField = this.boardFailField();
      const failValues = this.boardFailValues();
      const boardResultField = this.boardResultField();
      const countField = kpi.boardCountField || "pad_no";
      const countAgg =
        kpi.boardCountAgg === "cardinality"
          ? { cardinality: { field: D.esField(countField) } }
          : { value_count: { field: countField } };

      const boardAggs = {
        latest: { max: { field: fields.time } },
        top_line: { terms: { field: D.esField(fields.line), size: 1 } },
        top_model: { terms: { field: D.esField(fields.model), size: 1 } },
        pad_count: countAgg,
        has_ng: { filter: { terms: { [failField]: failValues } } },
        top_result: { terms: { field: boardResultField, size: 1 } },
      };

      if (fields.machine) {
        boardAggs.top_machine = { terms: { field: D.esField(fields.machine), size: 1 } };
      }

      const serialSources = D.getKpi().serialSourceFields || [fields.serial, "barcode", "source_file"];
      boardAggs.top_serial = {
        top_hits: {
          size: 1,
          sort: [{ [fields.time]: { order: "desc" } }],
          _source: { includes: serialSources },
        },
      };

      const agg = {
        size: 0,
        query: this.buildEsQuery(this.buildEsFilters()),
        aggs: {
          boards: {
            composite: {
              size: D.config.pageSize,
              sources: [{ board: { terms: { field: kpi.serialField || "array_barcode.keyword" } } }],
            },
            aggs: boardAggs,
          },
        },
      };
      if (afterKey) agg.aggs.boards.composite.after = afterKey;
      return agg;
    },
  };
})(window.Dashboard);
