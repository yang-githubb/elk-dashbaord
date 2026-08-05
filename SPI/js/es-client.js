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
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), cfg().fetchTimeoutMs);
      const onAbort = () => controller.abort();
      signal?.addEventListener("abort", onAbort);

      try {
        const headers = { "Content-Type": "application/json" };
        if (!usesProxy()) headers.Authorization = authHeader();

        const payload = JSON.stringify(body);
        console.debug("ES request body:", body);
        const res = await fetch(searchUrl(), {
          method: "POST",
          headers,
          body: payload,
          signal: controller.signal,
        });

        const text = await res.text();

        if (!res.ok) {

          console.error(
            "HTTP Error:",
            res.status,
            text
          );

          throw new Error(
            `HTTP ${res.status} ${res.statusText}`
          );
        }

        return JSON.parse(text);
      } finally {
        clearTimeout(timeout);
        signal?.removeEventListener("abort", onAbort);
      }
    },
  };
})(window.Dashboard);
