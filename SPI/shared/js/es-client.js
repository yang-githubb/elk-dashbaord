/**
 * Elasticsearch HTTP client.
 *
 * search()      → detail index  (proxy POST /search)
 * searchBoard() → board index   (proxy POST /search-board)
 */
(function (D) {
  const cfg = () => D.config || {};

  function usesProxy() {
    return Boolean(cfg().proxyUrl);
  }

  function proxyBaseUrl() {
    const url = cfg().proxyUrl || "";
    if (url.startsWith("http")) {
      return url.replace(/\/search\/?$/, "");
    }
    return window.location.origin;
  }

  function searchUrl() {
    const { proxyUrl, node, index } = cfg();
    if (proxyUrl) {
      if (proxyUrl.startsWith("http")) return proxyUrl;
      const prefix = proxyUrl.startsWith("/") ? "" : "/";
      return `${window.location.origin}${prefix}${proxyUrl}`;
    }
    return `${node.replace(/\/$/, "")}/${index}/_search`;
  }

  function boardSearchUrl() {
    if (cfg().proxyUrl) {
      return `${window.location.origin}/search-board`;
    }
    const { node, boardIndex } = cfg();
    return `${node.replace(/\/$/, "")}/${boardIndex}/_search`;
  }

  function authHeader() {
    const { username, password } = cfg();
    return "Basic " + btoa(`${username}:${password}`);
  }

  async function postSearch(url, body, signal) {
    const controller = new AbortController();
    const timeoutMs = Number(cfg().fetchTimeoutMs) || 0;
    const timeout =
      timeoutMs > 0
        ? setTimeout(() => controller.abort(), timeoutMs)
        : null;
    const onAbort = () => controller.abort();
    signal?.addEventListener("abort", onAbort);

    try {
      const headers = { "Content-Type": "application/json" };
      if (!usesProxy()) {
        headers.Authorization = authHeader();
      }

      const res = await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      const text = await res.text();
      if (!res.ok) {
        throw new Error(`HTTP ${res.status} ${res.statusText}`);
      }
      return JSON.parse(text);
    } finally {
      if (timeout) clearTimeout(timeout);
      signal?.removeEventListener("abort", onAbort);
    }
  }

  D.esClient = {
    searchUrl,
    usesProxy,
    proxyBaseUrl,
    boardSearchUrl,
    search: (body, signal) => postSearch(searchUrl(), body, signal),
    searchBoard: (body, signal) => postSearch(boardSearchUrl(), body, signal),
  };
})(window.Dashboard);
