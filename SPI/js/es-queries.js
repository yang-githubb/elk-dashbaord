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
                const filterTimeField = fields.time;
                if (filterTimeField) {
                    filters.push({ range: { [filterTimeField]: { gte: timeRanges[D.state.time] } } });
                }
            }
            const lineField = D.esField(fields.line);
            if (D.state.line && lineField) filters.push({ term: { [lineField]: D.state.line } });

            const modelField = D.esField(fields.model);
            if (D.state.model && modelField) filters.push({ term: { [modelField]: D.state.model } });

            const serialField = D.esField(fields.serial);
            if (D.state.boardSearch?.trim() && serialField) {
                filters.push({
                    prefix: {
                        [serialField]: D.state.boardSearch.trim()
                    }
                });
            }

            const stationField = D.esField(fields.station);
            if (D.config.stationValue && stationField) {
                filters.push({
                    term: {
                        [stationField]: D.config.stationValue
                    }
                });
            }

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
            const kpi = D.getKpi();
            const detailField = kpi.serialField || "source_file.keyword";

            const filters = [...this.buildEsFilters()];
            if (detailField) {
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

        buildDashboardAggs() {

            const kpi = D.getKpi();

            const rf =
                kpi.componentResultField ||
                kpi.resultField ||
                "pcb_result.keyword";

            return {

                // ==================================================
                // PAD KPI
                // ==================================================

                total_count: {
                    value_count: {
                        field: rf
                    }
                },

                count_good: {
                    filter: this.buildTermsFilter(
                        rf,
                        kpi.good || ["GOOD"]
                    )
                },

                count_pass: {
                    filter: this.buildTermsFilter(
                        rf,
                        kpi.pass || ["PASS", "WARNING"]
                    )
                },

                count_fail: {
                    filter: this.buildTermsFilter(
                        rf,
                        kpi.fail || ["NG"]
                    )
                },

                pad_failure_types: {
                    filter: this.buildTermsFilter(
                        rf,
                        kpi.fail || ["NG"]
                    ),
                    aggs: {
                        types: {
                            terms: {
                                field: rf,
                                size: 25,
                                order: {
                                    _count: "desc"
                                }
                            }
                        }
                    }
                },

                // ==================================================
                // BOARD KPI
                //
                // SPI:
                // 1 source_file = 1 inspection attempt
                //
                // source_file has exactly one pcb_result
                //
                // GOOD    -> Good
                // WARNING -> Pass
                // PASS    -> Pass
                // NG      -> Fail
                //
                // Count unique inspection attempts
                // ==================================================

                board_results: {
                    terms: {
                        field: this.boardResultField(),
                        size: 10
                    },
                    aggs: {
                        inspections: {
                            cardinality: {
                                field: "source_file.keyword"
                            }
                        }
                    }
                }

            };
        },
        buildBoardAnalysisAggs() {

            const fields = D.getFields();
            const lineField = D.esField(fields.line);
            const modelField = D.esField(fields.model);
            const boardResultField = this.boardResultField();

            return {

                lines: lineField
                    ? {
                        terms: {
                            field: lineField,
                            size: 100
                        },
                        aggs: {
                            board_results: {
                                terms: {
                                    field: boardResultField,
                                    size: 10
                                },
                                aggs: {
                                    inspections: {
                                        cardinality: {
                                            field: "source_file.keyword"
                                        }
                                    }
                                }
                            }
                        }
                    }
                    : { terms: { field: "_id", size: 0 } },

                models: modelField
                    ? {
                        terms: {
                            field: modelField,
                            size: 200
                        },
                        aggs: {
                            board_results: {
                                terms: {
                                    field: boardResultField,
                                    size: 10
                                },
                                aggs: {
                                    inspections: {
                                        cardinality: {
                                            field: "source_file.keyword"
                                        }
                                    }
                                }
                            }
                        }
                    }
                    : { terms: { field: "_id", size: 0 } },

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

        buildBoardListAgg(afterKey = null) {
            const fields = D.getFields();
            const kpi = D.getKpi();
            const failField = this.boardFailField();
            const failValues = this.boardFailValues();
            const boardResultField = String(this.boardResultField() || "pcb_result.keyword");
            const boardGroupField = String(kpi.serialField || "source_file.keyword").trim() || "source_file.keyword";
            const countField = kpi.boardCountField || "pad_no";
            const countAgg =
                kpi.boardCountAgg === "cardinality"
                    ? { cardinality: { field: D.esField(countField) } }
                    : { value_count: { field: countField } };

            const boardResultSource = boardResultField.replace(/\.keyword$/, "");
            const requiredFields = [
                fields.line,
                fields.model,
                fields.serial,
                fields.time,
                boardResultSource,
            ];
            if (fields.machine) {
                requiredFields.push(fields.machine);
            }
            const boardAggs = {
                latest_doc: {
                    top_hits: {
                        size: 1,
                        sort: [{ [fields.time]: { order: "desc", unmapped_type: "date" } }],
                        _source: requiredFields.filter(Boolean),
                    },
                },
                pad_count: countAgg,
                has_pad_fail: {
                    filter: this.buildTermsFilter(
                        "pad_result.keyword",
                        kpi.padFailResults
                    )
                }
            };

            // const serialSources = D.getKpi().serialSourceFields || [fields.serial, "barcode", "source_file"];
            // boardAggs.top_serial = {
            //   top_hits: {
            //     size: 1,
            //     sort: [{ [fields.time]: { order: "desc" } }],
            //     _source: { includes: serialSources },
            //   },
            // };

            const agg = {
                size: 0,
                query: this.buildEsQuery(this.buildEsFilters()),
                aggs: {
                    boards: {
                        composite: {
                            size: D.config.pageSize,
                            sources: [{ board: { terms: { field: boardGroupField } } }],
                        },
                        aggs: boardAggs,
                    },
                },
            };
            if (afterKey) agg.aggs.boards.composite.after = afterKey;
            return agg;
        },

        buildBoardListExportAgg(afterKey = null) {
            // Optimized query for export and fast board display - uses top_hits to get latest document per board
            // This is much faster than computing multiple sub-aggregations
            const fields = D.getFields();
            const kpi = D.getKpi();
            const serialField = kpi.serialField || "source_file.keyword";
            
            // Only request the fields we need for export to reduce data transfer
            const requiredFields = [
                fields.serial,
                fields.model,
                fields.line,
                fields.time,
                "pad_no",
                fields.result || "pcb_result",
            ].filter(Boolean);

            const agg = {
                size: 0,
                query: this.buildEsQuery(this.buildEsFilters()),
                aggs: {
                    boards: {
                        terms: {
                            field: serialField,
                            size: D.config.pageSize,
                            order: { _key: "asc" },
                        },
                        aggs: {
                            latest_doc: {
                                top_hits: {
                                    size: 1,
                                    sort: [{ [fields.time]: { order: "desc", unmapped_type: "date" } }],
                                    _source: requiredFields,
                                },
                            },
                        },
                    },
                },
            };
            return agg;
        },

        transformExportBucketToRow(bucket, source) {
            // Helper to convert export aggregation bucket + source to row format
            const fields = D.getFields();
            return {
                board: bucket.key,
                [fields.serial]: bucket.key,
                [fields.model]: source[fields.model] || "—",
                [fields.line]: source[fields.line] || "—",
                [fields.time]: source[fields.time] || "—",
                pad_no: source.pad_no || "—",
                result: source[fields.result] || source.pcb_result || "—",
            };
        },
    };
})(window.Dashboard);
