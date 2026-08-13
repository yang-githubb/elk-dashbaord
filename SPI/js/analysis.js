/**
 * SPI Analysis Page
 *
 * Responsibilities:
 * - Read filters from URL
 * - Provide navigation back to dashboard
 * - Verify Dashboard modules loaded correctly
 * - Verify Elasticsearch connectivity
 */

// =========================
// Dashboard Dependencies
// =========================

const Dashboard = window.Dashboard;

const {
    esClient,
    esQueries,
    ui
} = Dashboard;

// =========================
// Filter State
// =========================

const params = new URLSearchParams(
    window.location.search
);

const filterState = {
    time: params.get("time") || "all",
    line: params.get("line") || "",
    model: params.get("model") || ""
};

Dashboard.state = {
    time: filterState.time,
    line: filterState.line,
    model: filterState.model
};
// =========================
// Navigation
// =========================

function initializeNavigation() {

    document
        .getElementById("back-dashboard")
        ?.addEventListener("click", () => {

            window.location.href = "index.html";

        });

}

// =========================
// Diagnostics
// =========================

function logStartupInformation() {

    console.log("================================");
    console.log("SPI Analysis Page");
    console.log("================================");

    console.log("Filter State:");
    console.log(filterState);

    console.log("Dashboard Object:");
    console.log(Dashboard);

}

// =========================
// Elasticsearch Connectivity
// =========================

async function testElasticsearchConnection() {

    try {

        const response = await esClient.search({
            size: 0
        });

        console.log("ES Connection OK");
        console.log(response);

    }
    catch (error) {

        console.error(
            "ES Connection Failed"
        );

        console.error(error);

        ui?.showError?.(
            error?.message ||
            "Failed to connect to Elasticsearch"
        );

    }

}

async function loadAnalysis() {

    try {

        console.log("loadAnalysis started");

        const query = esQueries.buildEsQuery(
            esQueries.buildBoardFilters()
        );

        const res = await esClient.searchBoard({
            size: 0,
            query,
            aggs: esQueries.buildBoardAnalysisAggs()
        });

        console.log("ANALYSIS RESPONSE");
        console.log(res);

        const lineRows =
            (res.aggregations?.lines?.buckets || [])
                .map(bucket => buildKpiRow(bucket, "line"));

        console.log("LINE ROWS");
        console.log(lineRows);

        lineRows.sort(
            (a, b) => b.total - a.total
        );

        renderLineTable(lineRows);

        const modelRows =
            (res.aggregations?.models?.buckets || [])
                .map(bucket => buildKpiRow(bucket, "model"));

        modelRows.sort(
            (a, b) => b.total - a.total
        );

        const topModels =
            modelRows.slice(0, 50);

        renderModelTable(topModels);
    }
    catch (error) {

        console.error("loadAnalysis failed");
        console.error(error);

    }

}

function renderModelTable(rows) {

    const thead =
        document.getElementById("model-kpi-thead");

    const tbody =
        document.getElementById("model-kpi-tbody");

    thead.innerHTML = `
        <tr>
            <th>Model</th>
            <th>Good</th>
            <th>Pass</th>
            <th>Fail</th>
            <th>Total</th>
            <th>Yield %</th>
        </tr>
    `;

    tbody.innerHTML = rows
        .map(row => `
            <tr>
                <td>${row.model}</td>
                <td>${row.good}</td>
                <td>${row.pass}</td>
                <td>${row.fail}</td>
                <td>${row.total}</td>
                <td>${row.yield}</td>
            </tr>
        `)
        .join("");

}

function buildKpiRow(bucket, keyName) {

    let good = 0;
    let pass = 0;
    let fail = 0;

    for (const result of bucket.board_results?.buckets || []) {

        const count =
            result.inspections?.value || 0;

        if (result.key === "GOOD") {

            good += count;

        }
        else if (
            result.key === "PASS" ||
            result.key === "WARNING"
        ) {

            pass += count;

        }
        else if (result.key === "NG") {

            fail += count;

        }

    }

    const total =
        good + pass + fail;

    return {
        [keyName]: bucket.key,
        good,
        pass,
        fail,
        total,
        yield:
            total > 0
                ? ((good / total) * 100).toFixed(2)
                : "0.00"
    };

}

function renderLineTable(rows) {

    const thead =
        document.getElementById("line-kpi-thead");

    const tbody =
        document.getElementById("line-kpi-tbody");

    thead.innerHTML = `
    <tr>
      <th>Line</th>
      <th>Good</th>
      <th>Pass</th>
      <th>Fail</th>
      <th>Total</th>
      <th>Yield %</th>
    </tr>
  `;

    tbody.innerHTML = rows
        .map(row => `508840D
      <tr>
        <td>${row.line}</td>
        <td>${row.good}</td>
        <td>${row.pass}</td>
        <td>${row.fail}</td>
        <td>${row.total}</td>
        <td>${row.yield}</td>
      </tr>
    `)
        .join("");

}

// =========================
// Bootstrap
// =========================

async function initialize() {

    initializeNavigation();

    logStartupInformation();

    await testElasticsearchConnection();

    await loadAnalysis();

}

initialize();