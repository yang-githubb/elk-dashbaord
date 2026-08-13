/**
 * Shared page shell — navigation, body theme, document title.
 */
(function (D) {
  function rootHref(path) {
    const normalized = String(path || "").replace(/^\//, "");
    return `/${normalized}`;
  }

  function renderNav(currentId) {
    const nav = document.querySelector(".dashboard-tabs");
    if (!nav) {
      return;
    }

    const registry = window.DASHBOARD_REGISTRY || [];
    const links = [
      `<a href="${rootHref("index.html")}" class="dashboard-tab${currentId ? "" : " dashboard-tab-active"}">Home</a>`,
      ...registry.map((entry) => {
        const active = entry.id === currentId ? " dashboard-tab-active" : "";
        return `<a href="${rootHref(entry.path)}" class="dashboard-tab${active}">${entry.label}</a>`;
      }),
    ];

    nav.innerHTML = links.join("");
  }

  function applyPageTheme() {
    if (!D.config) {
      return;
    }

    const bodyClass = D.config.bodyClass;
    if (bodyClass) {
      document.body.classList.add(bodyClass);
    }

    const pageTitle = D.config?.labels?.pageTitle || D.config?.schemaLabel;
    if (pageTitle) {
      document.title = pageTitle;
      const heading = document.querySelector(".header-title h1");
      if (heading) {
        heading.textContent = pageTitle;
      }
    }
  }

  D.shell = {
    rootHref,
    renderNav,
    applyPageTheme,
    init() {
      const page = window.DASHBOARD_PAGE || {};
      renderNav(page.id || "");
      applyPageTheme();
    },
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => D.shell.init());
  } else {
    D.shell.init();
  }
})(window.Dashboard = window.Dashboard || {});
