// Native scroll restoration can run before an expanded collection is rebuilt.
// Remember the clicked card, then restore its viewport offset once the shelves exist.
export function preserveCollectionReturn(sections, ready = () => true) {
  const back = performance.getEntriesByType('navigation')[0]?.type === 'back_forward';
  const saved = history.state?.btrCollectionReturn;
  let pending = back && saved && typeof saved.section === 'string' &&
    typeof saved.item === 'string' && Number.isFinite(saved.offset) ? saved : null;
  let loaded = document.readyState === 'complete', fontsReady = !document.fonts;
  let frame = 0, deadline = 0, allowPartial = false;
  const stop = () => { pending = null; cancelAnimationFrame(frame); clearTimeout(deadline); };
  function restore() {
    if (!pending || !loaded || !fontsReady || (!ready() && !allowPartial)) return;
    const state = sections.get(pending.section);
    if (!state?.expanded) return stop();
    const link = [...state.grid.querySelectorAll('a[href]')].find(anchor =>
      new URL(anchor.href, location.href).searchParams.get('item') === pending.item);
    const target = link?.closest('.belt-card,.pendant-card,.product-card') || link || state.section;
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => {
      // pageshow/native restoration and layout each get a frame first.
      frame = requestAnimationFrame(() => {
        if (!pending) return;
        window.scrollTo({left: 0, top: Math.max(0, scrollY + target.getBoundingClientRect().top - pending.offset), behavior: 'instant'});
        stop();
      });
    });
  }
  if (pending) {
    if (document.fonts) document.fonts.ready.then(() => { fontsReady = true; restore(); });
    const afterLoad = () => {
      loaded = true; restore();
      // An unavailable neighboring catalog must not prevent returning to a belt.
      if (pending) deadline = setTimeout(() => { allowPartial = true; restore(); }, 2000);
    };
    if (loaded) afterLoad(); else window.addEventListener('load', afterLoad, {once: true});
    window.addEventListener('pageshow', restore, {once: true});
    document.addEventListener('btr:collection-ready', restore);
    for (const type of ['wheel','touchstart','pointerdown','keydown']) document.addEventListener(type, stop, {capture: true, passive: true, once: true});
  }
  document.addEventListener('click', event => {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return;
    const link = event.target.closest?.('a[href]');
    if (!link || link.target === '_blank' || link.hasAttribute('download')) return;
    const url = new URL(link.href, location.href);
    if (url.origin !== location.origin || !['/product','/product.html'].includes(url.pathname) || !url.searchParams.has('item')) return;
    const state = sections.get(link.closest('[data-compact-collection]')?.dataset.compactCollection);
    if (!state?.expanded) return;
    const target = link.closest('.belt-card,.pendant-card,.product-card') || link;
    const snapshot = {section: state.definition.id, item: url.searchParams.get('item'), offset: target.getBoundingClientRect().top};
    history.replaceState({...history.state, btrCollectionReturn: snapshot}, '');
  });
}
