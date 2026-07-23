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

            if (D.state.boardSearch?.trim()) {

                filters.push({
                    prefix: {
                        [D.esField(fields.serial)]:
                            D.state.boardSearch.trim()
                    }
                });
            }

            filters.push({
                term: {
                    [D.esField(fields.station)]: "SPI"
                }
            });

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

            const detailField = "source_file.keyword";

            return [
                ...this.buildEsFilters(),
                {
                    term: {
                        [detailField]: serial
                    }
                }
            ];
        },

        buildEsQuery(filters) {
            return filters.length ? { bool: { filter: filters } } : { match_all: {} };
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
                    filter: {
                        terms: {
                            [rf]: kpi.good || ["GOOD"]
                        }
                    }
                },

                count_pass: {
                    filter: {
                        terms: {
                            [rf]: kpi.pass || ["PASS", "WARNING"]
                        }
                    }
                },

                count_fail: {
                    filter: {
                        terms: {
                            [rf]: kpi.fail || ["NG"]
                        }
                    }
                },

                pad_failure_types: {
                    filter: {
                        terms: {
                            [rf]: kpi.fail || ["NG"]
                        }
                    },
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
                        field: "pcb_result.keyword",
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

            return {

                lines: {
                    terms: {
                        field: D.esField(fields.line),
                        size: 100
                    },
                    aggs: {
                        board_results: {
                            terms: {
                                field: "pcb_result.keyword",
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
                },

                models: {
                    terms: {
                        field: D.esField(fields.model),
                        size: 200
                    },
                    aggs: {
                        board_results: {
                            terms: {
                                field: "pcb_result.keyword",
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
            const boardResultField = this.boardResultField();
            const boardGroupField = "source_file.keyword";
            const countField = kpi.boardCountField || "pad_no";
            const countAgg =
                kpi.boardCountAgg === "cardinality"
                    ? { cardinality: { field: D.esField(countField) } }
                    : { value_count: { field: countField } };

            const boardAggs = {

                latest: {
                    max: {
                        field: fields.time
                    }
                },

                top_line: {
                    terms: {
                        field: D.esField(fields.line),
                        size: 1
                    }
                },

                top_model: {
                    terms: {
                        field: D.esField(fields.model),
                        size: 1
                    }
                },

                // ==========================================
                // Display barcode in Serial column
                // while grouping by source_file.keyword
                // ==========================================
                top_barcode: {
                    terms: {
                        field: "array_barcode.keyword",
                        size: 1
                    }
                },

                pad_count: countAgg,

                has_pad_fail: {
                    filter: {
                        terms: {
                            "pad_result.keyword":
                                kpi.padFailResults
                        }
                    }
                },

                top_result: {
                    terms: {
                        field: boardResultField,
                        size: 1
                    }
                }
            };
            if (fields.machine) {
                boardAggs.top_machine = { terms: { field: D.esField(fields.machine), size: 1 } };
            }

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
            const serialField = "source_file.keyword";
            
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
                                    sort: [{ [fields.time]: { order: "desc" } }],
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
