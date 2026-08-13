/** Elasticsearch query builders */
(function (D) {
    D.esQueries = {
        isAllTime() {
            return D.state.time === "all";
        },
        buildBoardFilters() {
            const fields = D.getBoardFields();
            const filters = [];
            const timeRanges = D.config.esTimeRanges || {};

            if (!this.isAllTime()) {
                filters.push({
                    range: {
                        [fields.time]: {
                            gte: timeRanges[D.state.time]
                        }
                    }
                });
            }

            const lineField = D.esField(fields.line);
            if (D.state.line && lineField) {
                filters.push({
                    term: {
                        [lineField]: D.state.line
                    }
                });
            }

            const modelField = D.esField(fields.model);
            if (D.state.model && modelField) {
                filters.push({
                    term: {
                        [modelField]: D.state.model
                    }
                });
            }

            if (D.config.stationValue) {
                filters.push({
                    term: {
                        "station": D.config.stationValue
                    }
                });
            }
            return filters;
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
            console.log("FIELDS", fields);
            console.log("FILTERS", filters);
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

            const rf = this.boardResultField();

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
                        kpi.boardGood || ["GOOD"]
                    )
                },

                count_pass: {
                    filter: this.buildTermsFilter(
                        rf,
                        kpi.boardPass || ["PASS", "WARNING"]
                    )
                },

                count_fail: {
                    filter: this.buildTermsFilter(
                        rf,
                        kpi.boardFail || ["NG"]
                    )
                },

                pad_failure_types: {
                    filter: this.buildTermsFilter(
                        rf,
                        kpi.boardFail || ["NG"]
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

            const fields = D.getBoardFields();
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
                                        value_count: {
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
                                        value_count: {
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
            const boardFields = D.getBoardFields();
            const kpi = D.getKpi();
            const boardResultField = String(this.boardResultField() || "pcb_result.keyword");
            const boardGroupField =
                String(
                    kpi.boardSerialField ||
                    kpi.serialField ||
                    "source_file.keyword"
                ).trim();
            const boardResultSource = boardResultField.replace(/\.keyword$/, "");
            const requiredFields = [
                boardFields.line,
                boardFields.model,
                boardFields.serial,
                boardFields.time,
                boardResultSource,
            ];
            if (boardFields.machine) {
                requiredFields.push(boardFields.machine);
            }
            const boardAggs = {
                latest_doc: {
                    top_hits: {
                        size: 1,
                        sort: [{ [boardFields.time]: { order: "desc", unmapped_type: "date" } }],
                        _source: requiredFields.filter(Boolean),
                    }
                }
            };
            console.log(
                "BOARD FILTERS",
                this.buildBoardFilters()
            );

            console.log(
                "BOARD FIELDS",
                boardFields
            );

            const agg = {
                size: 0,
                query: this.buildEsQuery(
                    this.buildBoardFilters()
                ),
                aggs: {
                    boards: {
                        composite: {
                            size: D.config.pageSize,
                            sources: [
                                {
                                    board: {
                                        terms: {
                                            field: boardGroupField
                                        }
                                    }
                                }
                            ]
                        },
                        aggs: boardAggs
                    }
                }
            };

            if (afterKey) {
                agg.aggs.boards.composite.after = afterKey;
            }

            return agg;
        },
        buildBoardListExportAgg(afterKey = null) {
            // Optimized query for export and fast board display - uses top_hits to get latest document per board
            // This is much faster than computing multiple sub-aggregations
            const fields = D.getBoardFields();
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
                query: this.buildEsQuery(this.buildBoardFilters()),
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
