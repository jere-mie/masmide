/* coi-serviceworker — github.com/gzuidhof/coi-serviceworker
 * Injects Cross-Origin-Embedder-Policy + Cross-Origin-Opener-Policy headers
 * so SharedArrayBuffer is available on GitHub Pages and other static hosts.
 *
 * This file is both the service worker itself (when running in a SW context)
 * and the registration script (when included in index.html as a <script src>).
 */
;(function () {
  const isSW = typeof window === 'undefined';

  if (isSW) {
    // ── Service Worker context ──────────────────────────────────────────────
    self.addEventListener('install', () => self.skipWaiting());
    self.addEventListener('activate', (event) =>
      event.waitUntil(self.clients.claim())
    );

    async function handleFetch(request) {
      // Avoid Chrome bug with opaque responses in cache
      if (request.cache === 'only-if-cached' && request.mode !== 'same-origin') {
        return;
      }
      let response;
      try {
        response = await fetch(request);
      } catch (e) {
        console.error('[coi-sw] fetch error', e);
        return;
      }
      if (!response || response.status === 0) return response;

      const headers = new Headers(response.headers);
      headers.set('Cross-Origin-Embedder-Policy', 'require-corp');
      headers.set('Cross-Origin-Opener-Policy', 'same-origin');
      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers,
      });
    }

    self.addEventListener('fetch', (event) => {
      event.respondWith(handleFetch(event.request));
    });
  } else {
    // ── Window context — register the SW ────────────────────────────────────
    if (!('serviceWorker' in navigator)) return;

    const reloadKey = 'coi-reloaded';
    const reloadedBySelf = sessionStorage.getItem(reloadKey);
    sessionStorage.removeItem(reloadKey);

    // Already cross-origin isolated — nothing to do
    if (window.crossOriginIsolated) return;

    // Prevent infinite reload loop
    if (reloadedBySelf) {
      console.warn('[coi-sw] Could not enable crossOriginIsolated after reload.');
      return;
    }

    let reloading = false;
    const reloadOnce = () => {
      if (reloading || window.crossOriginIsolated) return;
      reloading = true;
      sessionStorage.setItem(reloadKey, '1');
      window.location.reload();
    };

    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!window.crossOriginIsolated) reloadOnce();
    });

    // currentScript.src is this file's URL — register it as the SW
    const swUrl = document.currentScript && document.currentScript.src;
    if (!swUrl) return;

    navigator.serviceWorker.register(swUrl).then((reg) => {
      const maybeReload = () => {
        if (window.crossOriginIsolated) return;
        if (navigator.serviceWorker.controller || reg.active || reg.waiting) {
          reloadOnce();
        }
      };

      const installing = reg.installing;
      if (installing) {
        installing.addEventListener('statechange', () => {
          if (installing.state === 'activated') {
            maybeReload();
          }
        });
      }

      maybeReload();
      navigator.serviceWorker.ready.then(maybeReload);
    }).catch((err) => {
      console.error('[coi-sw] registration failed', err);
    });
  }
})();
