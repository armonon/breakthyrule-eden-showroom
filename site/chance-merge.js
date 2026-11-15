/* One place to explore a live Lab design or a mystery package. */
(() => {
  'use strict';
  const byId = id => document.getElementById(id);
  const root = byId('chance');
  const modes = ['random', 'mystery'];
  const tabs = { random: byId('chance-random-tab'), mystery: byId('chance-mystery-tab') };
  const panels = { random: byId('photo-story'), mystery: byId('mystery') };
  if (!root || root.dataset.chanceReady || modes.some(mode => !tabs[mode] || !panels[mode])) return;
  root.dataset.chanceReady = 'true';

  const modeForHash = hash => hash === '#mystery' ? 'mystery' : hash === '#photo-story' ? 'random' : null;
  let current = null;
  function select(mode, focus = false) {
    if (!modes.includes(mode)) return false;
    const changed = current !== mode;
    current = mode;
    for (const name of modes) {
      const active = name === mode;
      tabs[name].setAttribute('aria-selected', String(active));
      tabs[name].tabIndex = active ? 0 : -1;
      panels[name].hidden = !active;
    }
    root.dataset.chanceMode = mode;
    if (focus) tabs[mode].focus({ preventScroll: true });
    return changed;
  }

  root.classList.add('is-enhanced');
  select(modeForHash(location.hash) || 'random');
  for (const mode of modes) {
    tabs[mode].addEventListener('click', () => select(mode));
    tabs[mode].addEventListener('keydown', event => {
      if (event.altKey || event.ctrlKey || event.metaKey) return;
      const index = modes.indexOf(mode);
      const next = event.key === 'Home' ? modes[0]
        : event.key === 'End' ? modes[modes.length - 1]
        : event.key === 'ArrowRight' ? modes[(index + 1) % modes.length]
        : event.key === 'ArrowLeft' ? modes[(index + modes.length - 1) % modes.length] : null;
      if (!next) return;
      event.preventDefault();
      select(next, true);
    });
  }

  // Reveal before the browser follows a fragment, including links to the current hash.
  document.addEventListener('click', event => {
    if (event.defaultPrevented || event.button !== 0 || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    const anchor = event.target instanceof Element ? event.target.closest('a[href]') : null;
    if (!anchor || anchor.hasAttribute('download') || (anchor.target && anchor.target !== '_self')) return;
    let url;
    try { url = new URL(anchor.href, location.href); } catch { return; }
    if (url.origin !== location.origin || url.pathname !== location.pathname || url.search !== location.search) return;
    const mode = modeForHash(url.hash);
    if (mode) select(mode);
  });
  window.addEventListener('hashchange', () => {
    const mode = modeForHash(location.hash);
    // Programmatic hash changes may target a panel that was hidden during native scrolling.
    if (mode && select(mode)) panels[mode].scrollIntoView({ block: 'start' });
  });

  const hero = byId('hero-stage');
  const heroName = byId('hero-name'), heroPrice = byId('hero-price');
  const name = byId('chance-random-name'), price = byId('chance-random-price');
  const open = byId('chance-open-design');
  if (!hero || !heroName || !heroPrice || !name || !price || !open) return;
  function liveDestination() {
    const href = hero.getAttribute('href');
    if (!href) return '/lab#build';
    try {
      const url = new URL(href, location.href);
      if (url.origin !== location.origin || url.username || url.password) return '/lab#build';
      if ((url.pathname === '/lab' && url.searchParams.get('design')) ||
          (url.pathname === '/product' && url.searchParams.get('item'))) return href;
    } catch { /* Keep the ordinary Lab link if the live preview has no valid destination. */ }
    return '/lab#build';
  }
  function mirror() {
    if (name.textContent !== heroName.textContent) name.textContent = heroName.textContent;
    if (price.textContent !== heroPrice.textContent) price.textContent = heroPrice.textContent;
    const href = liveDestination();
    if (open.getAttribute('href') !== href) open.setAttribute('href', href);
  }
  const observer = new MutationObserver(mirror);
  observer.observe(hero, { attributes: true, attributeFilter: ['href'] });
  observer.observe(heroName, { childList: true, characterData: true, subtree: true });
  observer.observe(heroPrice, { childList: true, characterData: true, subtree: true });
  mirror();
})();
