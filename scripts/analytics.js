(() => {
  try {
    const productionHosts = ["sharing-view.memoria-ll.link"];
    if ((location.protocol !== 'https:' || !productionHosts.includes(location.hostname.toLowerCase())) &&
        globalThis.__MEMORIA_ANALYTICS_TEST__ !== true) return;
    const path = location.pathname;
    if (path !== '/' && path !== '/index.html') return;
    void fetch('https://memoria-analytics.yorutsuki22.workers.dev/_analytics/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event: 'page_view', path }),
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
      keepalive: true,
      signal: AbortSignal.timeout(5000),
    }).catch(() => {});
  } catch {
    // Unsupported browsers and network failures leave the page usable.
  }
})();
