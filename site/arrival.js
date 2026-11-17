/* Early homepage gate. Readiness follows work, never a simulated progress timer. */
(() => {
  'use strict';
  const params = new URLSearchParams(location.search);
  if (window.btrArrival || params.has('cover') || params.has('about')) return;
  // A Back/Forward reload is a return to the collection, not a fresh arrival.
  // Keep the settled handle so the Codex does not replace it when storage is unavailable.
  if (window.performance?.getEntriesByType?.('navigation')?.[0]?.type === 'back_forward') {
    const noop = () => {};
    window.btrArrival = { active: false, hold: () => noop, mount: noop, pending: [], failures: [] };
    document.documentElement.dataset.arrivalState = 'history';
    return;
  }
  const pending = new Set(), failures = [], locked = new Map();
  let active = true, sealed = false, finishing = false, overlay, observer, film;
  let slowTimer, previousFocus;
  const decoded = new WeakSet();
  const html = document.documentElement;
  html.classList.add('btr-arriving');

  function hold(label) {
    if (!active) return () => {};
    const task = { label }; pending.add(task);
    let settled = false;
    return error => {
      if (settled) return; settled = true;
      pending.delete(task);
      if (error) failures.push(label);
      maybeReveal();
    };
  }
  function lockChildren() {
    for (const child of document.body.children) {
      if (child === overlay || /^(SCRIPT|STYLE|LINK)$/.test(child.tagName) || locked.has(child)) continue;
      locked.set(child, child.inert); child.inert = true;
    }
  }
  function release(reason = 'ready') {
    if (!active) return;
    active = false; clearTimeout(slowTimer); observer?.disconnect(); film?.destroy();
    html.classList.remove('btr-arriving');
    html.dataset.arrivalState = reason;
    for (const [child, wasInert] of locked) child.inert = wasInert;
    locked.clear();
    // Resume the normal hero only after the temporary decoder has stopped.
    window.dispatchEvent(new Event('btr:arrival-state'));
    if (!overlay) return;
    if (overlay.contains(document.activeElement)) {
      if (previousFocus?.isConnected && previousFocus !== document.body) previousFocus.focus({ preventScroll: true });
      else {
        const main = document.querySelector('main');
        if (main) { const old = main.getAttribute('tabindex'); main.tabIndex = -1; main.focus({ preventScroll: true }); if (old == null) main.removeAttribute('tabindex'); else main.setAttribute('tabindex', old); }
      }
    }
    overlay.setAttribute('aria-hidden', 'true'); overlay.inert = true;
    overlay.classList.add('is-leaving');
    setTimeout(() => overlay.remove(), matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 340);
  }
  function maybeReveal() {
    if (!active || !sealed || pending.size || finishing || document.hidden) return;
    finishing = true;
    // Give newly mounted content and decoded images a paint before the crossfade.
    requestAnimationFrame(() => requestAnimationFrame(() => {
      finishing = false;
      scanImages();
      if (!pending.size && !document.hidden) release(failures.length ? 'fallback' : 'ready');
      else maybeReveal();
    }));
  }
  function mount() {
    if (!active || overlay || !document.body) return;
    previousFocus = document.activeElement;
    overlay = document.createElement('section'); overlay.id = 'btr-arrival';
    overlay.setAttribute('aria-label', 'Loading Break Thy Rule');
    overlay.innerHTML = '<div class="arrival-film" aria-hidden="true"><img crossorigin="anonymous" src="https://apple-cover-assets--breakthyrule-eden-showroom.netlify.app/hero-film-poster.jpg" alt="" fetchpriority="high"></div><div class="arrival-caption"><div><strong class="arrival-brand">BREAKTHYRULE</strong><p class="arrival-status" role="status" aria-live="polite">Preparing the collection…</p></div><div class="arrival-controls"><button type="button" class="arrival-pause" hidden>Pause film</button><button type="button" class="arrival-continue" hidden>Enter site</button></div></div>';
    document.body.prepend(overlay);
    overlay.querySelector('.arrival-continue').addEventListener('click', () => release('continued'));
    lockChildren(); observer = new MutationObserver(lockChildren); observer.observe(document.body, { childList: true });
    // An explicit escape hatch for stalled requests, not a fake success deadline.
    slowTimer = setTimeout(() => {
      if (!active) return;
      overlay.querySelector('.arrival-status').textContent = 'Still preparing. You can enter while loading continues.';
      overlay.querySelector('.arrival-continue').hidden = false;
    }, 18000);
    import('/site/arrival-film.mjs?v=1').then(({ createArrivalFilm }) => {
      if (active) film = createArrivalFilm(overlay.querySelector('.arrival-film'), overlay.querySelector('.arrival-pause'));
    }).catch(() => {
      // Film is decoration: a failed renderer must never strand the visitor.
      if (active) overlay.dataset.filmState = 'unavailable';
    });
  }
  function visible(image) {
    if (overlay?.contains(image) || image.hidden) return false;
    const rect = image.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0 && rect.bottom > 0 && rect.top < innerHeight && rect.right > 0 && rect.left < innerWidth && getComputedStyle(image).visibility !== 'hidden';
  }
  function decodeImage(image) {
    return new Promise((resolve, reject) => {
      let done = false;
      const finish = error => {
        if (done) return; done = true; clearTimeout(timeout);
        image.removeEventListener('load', loaded); image.removeEventListener('error', failed);
        error ? reject(error) : resolve();
      };
      const loaded = () => {
        if (!image.naturalWidth) return finish(new Error('Image unavailable'));
        if (image.decode) image.decode().then(() => finish(), finish); else finish();
      };
      const failed = () => finish(new Error('Image unavailable'));
      const timeout = setTimeout(() => finish(new Error('Image timed out')), 15000);
      image.addEventListener('load', loaded); image.addEventListener('error', failed);
      image.loading = 'eager';
      if (image.complete) loaded();
    });
  }
  function scanImages() {
    for (const image of document.images) {
      if (!decoded.has(image) && visible(image)) { decoded.add(image); watch(decodeImage(image), 'visible image'); }
    }
  }
  function stylesheetReady(link) {
    if (link.sheet || link.disabled) return Promise.resolve();
    return new Promise(resolve => {
      const done = () => { clearTimeout(timeout); link.removeEventListener('load', done); link.removeEventListener('error', done); resolve(); };
      const timeout = setTimeout(done, 15000);
      link.addEventListener('load', done); link.addEventListener('error', done);
    });
  }
  function watch(promise, label, timeoutMs = 15000) {
    const settle = hold(label);
    const timeout = setTimeout(() => settle(new Error('Timed out')), timeoutMs);
    Promise.resolve(promise).then(() => { clearTimeout(timeout); settle(); }, error => { clearTimeout(timeout); settle(error); });
  }
  const domReady = hold('page layout');
  window.btrArrival = {
    get active() { return active; }, hold, mount,
    // Diagnostic snapshots are also useful when a visitor reports a slow entry.
    get pending() { return [...pending].map(task => task.label); },
    get failures() { return [...failures]; }
  };
  async function ready() {
    mount();
    // Let other DOMContentLoaded handlers mount header, cards and collections.
    await new Promise(resolve => setTimeout(resolve, 0));
    if (!active) return;
    const styles = [...document.querySelectorAll('link[rel="stylesheet"]')].map(stylesheetReady);
    watch(Promise.all(styles).then(() => document.fonts?.ready), 'styles and typefaces', 20000);
    scanImages();
    sealed = true; domReady();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ready, { once: true });
  else void ready();
  document.addEventListener('visibilitychange', maybeReveal);
  // BFCache restores a usable page, never a stranded mid-load overlay.
  window.addEventListener('pagehide', () => release('navigation'));
  window.addEventListener('pageshow', event => { if (event.persisted) { release('history'); overlay?.remove(); } });
})();
