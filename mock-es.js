/**
 * Mock Elasticsearch client for offline development.
 */
(function () {
  const MOCK_RECORD_COUNT = 100;

  const SAMPLE_SOURCE = {
    station: "SPI",
    line: "SMT1",
    machine: "KY8030-2",
    pcb_name: "956-387-10_959-387-10ABOT_DS-404466",
    pcb_result: "WARNING",
    array_barcode: "50817A8",
    panel_result: "GOOD",
    component_id: "C1652",
    pad_no: 201,
    volume: 124.0813,
    height: 161.3112,
    area: 97.68893,
    offset_x: 0.01338007,
    offset_y: 0.008061715,
    pad_result: "GOOD",
    is_defect: false,
    inspection_start: "22:23:29",
    inspection_end: "22:24:05",
    source_file: "50817A8_260620222329_956-387-10_959-387-10ABOT_DS-404466.csv.processing",
    timestamp: "2026-06-20T14:24:19.075076Z",
  };

  const LINES = ["SMT1", "SMT2", "SMT3"];
  const PCB_NAMES = [
    "956-387-10_959-387-10ABOT_DS-404466",
    "627-351-12ABOT_JOB_DS-406546",
    "628-100-01C_BOT_DS-401100",
  ];
  const BARCODES = ["50817A8", "508BFD5", "508C912", "508D104", "508E221"];
  const PCB_RESULTS = ["GOOD", "GOOD", "GOOD", "WARNING", "NG"];

  const ES_TIME_OFFSET_MINUTES = {
    "now-15m": 15,
    "now-1h": 60,
    "now-6h": 360,
    "now-24h": 1440,
    "now-7d": 10080,
    "now-30d": 43200,
  };

  function buildMockRecords(count) {
    const records = [];
    const now = Date.now();

    for (let i = 0; i < count; i++) {
      const daysAgo = i % 14;
      const ts = new Date(now - daysAgo * 86400000 - (i % 20) * 3600000);
      const pcbResult = PCB_RESULTS[i % PCB_RESULTS.length];
      const barcode = BARCODES[i % BARCODES.length];

      records.push({
        _index: `flexh1smtmachinesdata-mock-${i}`,
        _id: `${barcode}_mock_${i}`,
        _score: 1,
        _source: {
          ...SAMPLE_SOURCE,
          line: LINES[i % LINES.length],
          pcb_name: PCB_NAMES[i % PCB_NAMES.length],
          pcb_result: pcbResult,
          pad_result: pcbResult === "NG" ? "NG" : pcbResult === "WARNING" ? "WARNING" : "GOOD",
          array_barcode: barcode,
          pad_no: 200 + (i % 50),
          component_id: `C${1600 + (i % 30)}`,
          timestamp: ts.toISOString(),
          inspection_date: ts.toISOString().slice(0, 10),
          is_defect: pcbResult === "NG",
        },
      });
    }

    return records.sort((a, b) => new Date(b._source.timestamp) - new Date(a._source.timestamp));
  }

  const MOCK_HITS = buildMockRecords(MOCK_RECORD_COUNT);

  function sinceTimestamp(gte) {
    const mins = ES_TIME_OFFSET_MINUTES[gte] ?? 0;
    return Date.now() - mins * 60 * 1000;
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
      if (f.term?.["station.keyword"] && source.station !== f.term["station.keyword"]) return false;
      if (f.term?.[serialField ] && source.array_barcode !== f.term[serialField]) return false;
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

  function aggDashboard(hits) {
    let good = 0;
    let pass = 0;
    let fail = 0;
    const boards = new Set();

    for (const h of hits) {
      const p = String(h._source.pcb_result || "").toUpperCase();
      boards.add(h._source.array_barcode);
      if (p === "GOOD") good++;
      else if (p === "PASS" || p === "WARNING") pass++;
      else if (p === "NG") fail++;
    }

    return {
      total_count: { value: hits.length },
      total_boards: { value: boards.size },
      count_good: { doc_count: good },
      count_pass: { doc_count: pass },
      count_fail: { doc_count: fail },
    };
  }

  function buildBoardBuckets(hits) {
    const boardMap = new Map();

    for (const h of hits) {
      const board = h._source.array_barcode;
      if (!boardMap.has(board)) {
        boardMap.set(board, {
          hasNg: false,
          line: h._source.line,
          model: h._source.pcb_name,
          latest: h._source.timestamp,
          padCount: 0,
        });
      }
      const b = boardMap.get(board);
      b.padCount++;
      if (String(h._source.pcb_result).toUpperCase() === "NG") b.hasNg = true;
      if (new Date(h._source.timestamp) > new Date(b.latest)) {
        b.latest = h._source.timestamp;
        b.line = h._source.line;
        b.model = h._source.pcb_name;
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

  function aggCompositePage(hits, afterKey, pageSize) {
    const boards = buildBoardBuckets(hits);
    const start = afterKey ? boards.findIndex((b) => b.key.board === afterKey.board) + 1 : 0;
    const page = boards.slice(start, start + pageSize);
    const next = start + pageSize < boards.length ? page[page.length - 1]?.key : undefined;
    return { boards: { buckets: page, after_key: next } };
  }

  window.mockEsSearch = function mockEsSearch(body) {
    const hits = getFilteredHits(body);

    if (body.size === 0 && body.aggs) {
      const aggs = {};
      if (body.aggs.lines) aggs.lines = { buckets: aggTerms(hits, "line") };
      if (body.aggs.models) aggs.models = { buckets: aggTerms(hits, "pcb_name") };
      if (body.aggs.count_good || body.aggs.total_boards) {
        Object.assign(aggs, aggDashboard(hits));
      }
      if (body.aggs.boards) {
        const after = body.aggs.boards?.composite?.after;
        const pageSize = body.aggs.boards?.composite?.size ?? 5000;
        Object.assign(aggs, aggCompositePage(hits, after, pageSize));
      }
      return Promise.resolve({
        took: 1,
        timed_out: false,
        hits: { total: { value: hits.length }, hits: [] },
        aggregations: aggs,
      });
    }

    const from = body.from ?? 0;
    const size = body.size ?? 25;

    return Promise.resolve({
      took: 1,
      timed_out: false,
      hits: {
        total: { value: hits.length, relation: "eq" },
        max_score: 1,
        hits: hits.slice(from, from + size),
      },
    });
  };
})();
