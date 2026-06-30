/** Elasticsearch HTTP client */
(function (D) {
  const cfg = () => D.config || {};

  function searchUrl() {
    const { proxyUrl, node, index } = cfg();
    if (proxyUrl) {
      if (proxyUrl.startsWith("http")) return proxyUrl;
      const prefix = proxyUrl.startsWith("/") ? "" : "/";
      return `${window.location.origin}${prefix}${proxyUrl}`;
    }
    return `${node.replace(/\/$/, "")}/${index}/_search`;
  }

  function usesProxy() {
    return Boolean(cfg().proxyUrl);
  }

  function proxyBaseUrl() {
    const url = cfg().proxyUrl || "";
    if (url.startsWith("http")) return url.replace(/\/search\/?$/, "");
    return window.location.origin;
  }

  function authHeader() {
    const { username, password } = cfg();
    return "Basic " + btoa(`${username}:${password}`);
  }

  D.esClient = {
    searchUrl,
    usesProxy,
    proxyBaseUrl,

    async search(body, signal) {
      if (D.useMock()) return window.mockEsSearch(body);

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), cfg().fetchTimeoutMs);
      const onAbort = () => controller.abort();
      signal?.addEventListener("abort", onAbort);

      try {
        const headers = { "Content-Type": "application/json" };
        if (!usesProxy()) headers.Authorization = authHeader();

        const res = await fetch(searchUrl(), {
          method: "POST",
          headers,
          body: JSON.stringify(body),
          signal: controller.signal,
        });

        const data = await res.json();
        if (!res.ok) {
          const msg =
            typeof data.error === "string"
              ? data.error
              : data.error?.reason || data.hint || res.statusText;
          throw new Error(msg);
        }
        return data;
      } finally {
        clearTimeout(timeout);
        signal?.removeEventListener("abort", onAbort);
      }
    },
  };
})(window.Dashboard);
