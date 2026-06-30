/**
 * Mock Elasticsearch client — supports SPI (pad-level) and AOI (component-level).
 */
(function () {
  const MOCK_SPI_COUNT = 100;
  const MOCK_AOI_COUNT = 50;

  const SAMPLE_SPI = {
    station: "SPI",
    line: "SMT1",
    machine: "KY8030-2",
    pcb_name: "956-387-10_959-387-10ABOT_DS-404466",
    pcb_result: "WARNING",
    array_barcode: "50817A8",
    component_id: "C1652",
    pad_no: 201,
    volume: 124.0813,
    height: 161.3112,
    area: 97.68893,
    offset_x: 0.01338007,
    offset_y: 0.008061715,
    is_defect: false,
    timestamp: "2026-06-20T14:24:19.075076Z",
  };

  const SAMPLE_AOI = {
    station: "AOI",
    line: "SMT1",
    machine: "ZENITHLITE",
    program_name: "T_8000-0262-000_REVC4-0_T",
    panel_barcode: "A26201350P",
    result: "PASS",
    ref_descrd_name: "U10",
    timestamp: "2026-06-25T11:10:40.230536Z",
  };

  const LINES = ["SMT1", "SMT2", "SMT3"];
  const SPI_MODELS = [
    "956-387-10_959-387-10ABOT_DS-404466",
    "627-351-12ABOT_JOB_DS-406546",
    "628-100-01C_BOT_DS-401100",
  ];
  const SPI_BARCODES = ["50817A8", "508BFD5", "508C912", "508D104", "508E221"];
  const SPI_RESULTS = ["GOOD", "GOOD", "GOOD", "WARNING", "NG"];
  const AOI_BARCODES = ["A26201350P", "A26201351Q", "A26201352R", "A26201353S"];
  const AOI_RESULTS = ["PASS", "PASS", "GOOD", "FAIL"];

  const ES_TIME_OFFSET_MINUTES = {
    "now-15m": 15, "now-1h": 60, "now-6h": 360,
    "now-24h": 1440, "now-7d": 10080, "now-30d": 43200,
  };

  function buildSpiRecords(count) {
    const records = [];
    const now = Date.now();
    for (let i = 0; i < count; i++) {
      const ts = new Date(now - (i % 14) * 86400000 - (i % 20) * 3600000);
      const pcbResult = SPI_RESULTS[i % SPI_RESULTS.length];
      const barcode = SPI_BARCODES[i % SPI_BARCODES.length];
      records.push({
        _index: `mock-spi-${i}`,
        _id: `${barcode}_spi_${i}`,
        _score: 1,
        _source: {
          ...SAMPLE_SPI,
          line: LINES[i % LINES.length],
          pcb_name: SPI_MODELS[i % SPI_MODELS.length],
          pcb_result: pcbResult,
          array_barcode: barcode,
          pad_no: 200 + (i % 50),
          component_id: `C${1600 + (i % 30)}`,
          timestamp: ts.toISOString(),
          inspection_date: ts.toISOString().slice(0, 10),
          is_defect: pcbResult === "NG",
        },
      });
    }
    return records;
  }

  function buildAoiRecords(count) {
    const records = [];
    const now = Date.now();
    for (let i = 0; i < count; i++) {
      const ts = new Date(now - (i % 14) * 86400000 - (i % 15) * 3600000);
      const result = AOI_RESULTS[i % AOI_RESULTS.length];
      const barcode = AOI_BARCODES[i % AOI_BARCODES.length];
      records.push({
        _index: `mock-aoi-${i}`,
        _id: `${barcode}_aoi_${i}`,
        _score: 1,
        _source: {
          ...SAMPLE_AOI,
          line: LINES[i % LINES.length],
          program_name: SPI_MODELS[i % SPI_MODELS.length],
          panel_barcode: barcode,
          result,
          ref_descrd_name: `U${10 + (i % 20)}`,
          timestamp: ts.toISOString(),
        },
      });
    }
    return records;
  }

  const MOCK_HITS = [...buildSpiRecords(MOCK_SPI_COUNT), ...buildAoiRecords(MOCK_AOI_COUNT)];

  function sinceTimestamp(gte) {
    return Date.now() - (ES_TIME_OFFSET_MINUTES[gte] ?? 0) * 60 * 1000;
  }

  function getStationFromFilters(filters) {
    const f = filters.find((x) => x.term?.["station.keyword"]);
    return f?.term?.["station.keyword"] || null;
  }

  function matchesFilters(source, filters) {
    for (const f of filters) {
      const range = f.range?.timestamp ?? f.range?.["@timestamp"];
      if (range?.gte) {
        const ts = source.timestamp ?? source["@timestamp"];
        if (new Date(ts).getTime() < sinceTimestamp(range.gte)) return false;
      }
      if (f.term?.["line.keyword"] && source.line !== f.term["line.keyword"]) return false;
      if (f.term?.["pcb_name.keyword"] && source.pcb_name !== f.term["pcb_name.keyword"]) return false;
      if (f.term?.["program_name.keyword"] && source.program_name !== f.term["program_name.keyword"]) return false;
      if (f.term?.["station.keyword"] && source.station !== f.term["station.keyword"]) return false;
      if (f.term?.["array_barcode.keyword"] && source.array_barcode !== f.term["array_barcode.keyword"]) return false;
      if (f.term?.["panel_barcode.keyword"] && source.panel_barcode !== f.term["panel_barcode.keyword"]) return false;
    }
    return true;
  }

  function getFilteredHits(body) {
    const filters = body.query?.bool?.filter ?? [];
    return MOCK_HITS.filter((h) => matchesFilters(h._source, filters));
  }

  function aggTerms(hits, field, size = 200) {
    const map = new Map();
    for (const h of hits) {
      const key = h._source[field];
      if (key == null) continue;
      map.set(key, (map.get(key) ?? 0) + 1);
    }
    return [...map.entries()]
      .sort((a, b) => String(a[0]).localeCompare(String(b[0])))
      .slice(0, size)
      .map(([key, doc_count]) => ({ key, doc_count }));
  }

  function aggDashboard(hits, station) {
    let good = 0, pass = 0, fail = 0;
    const boards = new Set();

    for (const h of hits) {
      const s = h._source;
      const p = String(station === "AOI" ? s.result : s.pcb_result || "").toUpperCase();
      const serial = station === "AOI" ? s.panel_barcode : s.array_barcode;
      boards.add(serial);
      if (p === "GOOD") good++;
      else if (p === "PASS" || p === "WARNING") pass++;
      else if (p === "NG" || p === "FAIL") fail++;
    }

    return {
      total_count: { value: hits.length },
      total_boards: { value: boards.size },
      count_good: { doc_count: good },
      count_pass: { doc_count: pass },
      count_fail: { doc_count: fail },
    };
  }

  function buildBoardBuckets(hits, station) {
    const boardMap = new Map();
    const isAoi = station === "AOI";

    for (const h of hits) {
      const s = h._source;
      const board = isAoi ? s.panel_barcode : s.array_barcode;
      const resultVal = String(isAoi ? s.result : s.pcb_result || "").toUpperCase();
      const model = isAoi ? s.program_name : s.pcb_name;

      if (!boardMap.has(board)) {
        boardMap.set(board, { hasNg: false, line: s.line, model, latest: s.timestamp, padCount: 0 });
      }
      const b = boardMap.get(board);
      b.padCount++;
      if (resultVal === "NG" || resultVal === "FAIL") b.hasNg = true;
      if (new Date(s.timestamp) > new Date(b.latest)) {
        b.latest = s.timestamp;
        b.line = s.line;
        b.model = model;
      }
    }

    return [...boardMap.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([key, v]) => ({
        key: { board: key },
        doc_count: v.padCount,
        has_ng: { doc_count: v.hasNg ? 1 : 0 },
        latest: { value: new Date(v.latest).getTime() },
        top_line: { buckets: v.line ? [{ key: v.line, doc_count: 1 }] : [] },
        top_model: { buckets: v.model ? [{ key: v.model, doc_count: 1 }] : [] },
        pad_count: { value: v.padCount },
      }));
  }

  function aggCompositePage(hits, afterKey, pageSize, station) {
    const boards = buildBoardBuckets(hits, station);
    const start = afterKey ? boards.findIndex((b) => b.key.board === afterKey.board) + 1 : 0;
    const page = boards.slice(start, start + pageSize);
    const next = start + pageSize < boards.length ? page[page.length - 1]?.key : undefined;
    return { boards: { buckets: page, after_key: next } };
  }

  window.mockEsSearch = function mockEsSearch(body) {
    const filters = body.query?.bool?.filter ?? [];
    const station = getStationFromFilters(filters) || "SPI";
    const hits = getFilteredHits(body);

    if (body.size === 0 && body.aggs) {
      const aggs = {};
      if (body.aggs.lines) aggs.lines = { buckets: aggTerms(hits, "line") };
      if (body.aggs.models) {
        aggs.models = { buckets: aggTerms(hits, station === "AOI" ? "program_name" : "pcb_name") };
      }
      if (body.aggs.count_good || body.aggs.total_boards) {
        Object.assign(aggs, aggDashboard(hits, station));
      }
      if (body.aggs.boards) {
        const after = body.aggs.boards?.composite?.after;
        const pageSize = body.aggs.boards?.composite?.size ?? 5000;
        Object.assign(aggs, aggCompositePage(hits, after, pageSize, station));
      }
      return Promise.resolve({
        took: 1, timed_out: false,
        hits: { total: { value: hits.length }, hits: [] },
        aggregations: aggs,
      });
    }

    const from = body.from ?? 0;
    const size = body.size ?? 25;
    return Promise.resolve({
      took: 1, timed_out: false,
      hits: {
        total: { value: hits.length, relation: "eq" },
        max_score: 1,
        hits: hits.slice(from, from + size),
      },
    });
  };
})();
