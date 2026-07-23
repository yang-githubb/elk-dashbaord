/**
 * SPI Failure Analysis Page
 */

const Dashboard = window.Dashboard;

const {
    esClient,
    esQueries
} = Dashboard;

/* ==========================================
 * URL Parameters
 * ========================================== */

const params = new URLSearchParams(
    window.location.search
);

const filterState = {
    time: params.get("time") || "all",
    line: params.get("line") || "",
    model: params.get("model") || "",
    failure: params.get("failure") || ""
};

Dashboard.state = {
    time: filterState.time,
    line: filterState.line,
    model: filterState.model
};
/* ==========================================
 * Navigation
 * ========================================== */

function initializeNavigation() {

    document
        .getElementById("back-dashboard")
        ?.addEventListener("click", () => {

            window.location.href = "index.html";

        });

}

/* ==========================================
 * Title
 * ========================================== */

function updateTitle() {

    const title =
        document.getElementById("failure-title");

    if (!title) {
        return;
    }

    title.textContent =
        `Failure Analysis - ${filterState.failure}`;

}

/* ==========================================
 * Query
 * ========================================== */

function buildQuery() {

    const filters = [
        ...esQueries.buildEsFilters()
    ];

    /*
     * Failure selected from Pareto
     *
     * POSITION
     * EXCESSIVE_VOLUME
     * BRIDGING
     * etc.
     */
    if (filterState.failure) {

        filters.push({
            term: {
                "pad_result.keyword": filterState.failure
            }
        });

    }

    return esQueries.buildEsQuery(filters);

}

/* ==========================================
 * Aggregations
 * ========================================== */

function buildAggregations() {

    return {

        lines: {
            terms: {
                field: "line.keyword",
                size: 100,
                order: {
                    _count: "desc"
                }
            }
        },

        models: {
            terms: {
                field: "pcb_name.keyword",
                size: 100,
                order: {
                    _count: "desc"
                }
            }
        },

        pads: {
            multi_terms: {
                terms: [
                    {
                        field: "array_barcode.keyword"
                    },
                    {
                        field: "pad_no"
                    }
                ],
                size: 100
            }
        }

    };

}

/* ==========================================
 * Table Rendering
 * ========================================== */
function renderTable(
    theadId,
    tbodyId,
    firstColumnTitle,
    buckets,
    formatter = null
) {

    const thead =
        document.getElementById(theadId);

    const tbody =
        document.getElementById(tbodyId);

    if (!thead || !tbody) {
        return;
    }

    thead.innerHTML = `
        <tr>
            <th>${firstColumnTitle}</th>
            <th>Count</th>
        </tr>
    `;

    tbody.innerHTML = buckets
        .map(bucket => {

            const label =
                formatter
                    ? formatter(bucket)
                    : bucket.key;

            return `
                <tr>
                    <td>${label}</td>
                    <td>${bucket.doc_count.toLocaleString()}</td>
                </tr>
            `;
        })
        .join("");

}

/* ==========================================
 * Load Analysis
 * ========================================== */

async function loadAnalysis() {

    try {

        console.log("Filter State");
        console.log(filterState);

        console.log("ES Filters");
        console.log(esQueries.buildEsFilters());

        console.log("Final Query");
        console.log(JSON.stringify(buildQuery(), null, 2));
        console.log(
            "Loading Failure Analysis:",
            filterState.failure
        );

        const response =
            await esClient.search({
                size: 0,
                query: buildQuery(),
                aggs: buildAggregations()
            });

        console.log(
            "FAILURE ANALYSIS RESPONSE"
        );

        console.log(response);

        renderTable(
            "line-failure-thead",
            "line-failure-tbody",
            "Line",
            response.aggregations?.lines?.buckets || []
        );

        renderTable(
            "model-failure-thead",
            "model-failure-tbody",
            "Model",
            response.aggregations?.models?.buckets || []
        );

        renderTable(
            "pad-failure-thead",
            "pad-failure-tbody",
            "Array Barcode | Pad No",
            response.aggregations?.pads?.buckets || [],
            bucket => {

                const barcode =
                    bucket.key?.[0] ?? "";

                const padNo =
                    bucket.key?.[1] ?? "";

                return `${barcode} | ${padNo}`;

            }
        );

    }
    catch (error) {

        console.error(
            "Failure Analysis Failed"
        );

        console.error(error);

    }

}

/* ==========================================
 * Startup
 * ========================================== */

async function initialize() {

    initializeNavigation();

    updateTitle();

    console.log(
        "Failure Analysis"
    );

    console.log(
        filterState
    );

    await loadAnalysis();

}

initialize();