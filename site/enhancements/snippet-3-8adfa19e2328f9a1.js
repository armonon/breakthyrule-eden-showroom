
/* Remove only the requested editorial blocks. Navigation and page features stay available. */
(() => {
  'use strict';
  const removeSelectors = [
    'body[data-page="home"] .hero-copy > .folio',
    'body[data-page="home"] .hero-copy > .lede',
    'body[data-page="home"] .hero-copy > .marginalia',
    'body[data-page="gallery"] .page-head > .folio',
    'body[data-page="gallery"] .page-head > h1',
    'body[data-page="archive"] .archive-head > .folio',
    'body[data-page="archive"] .archive-head > h1',
    'body[data-page="archive"] .archive-head > .lede',
    '.showroom-band > .wrap > div',
    '.btr-plate > .btr-tagline',
    '.btr-plate > .btr-tally',
    '#showcase-title'
  ].join(',');
  function removeBlock(element) {
    if (element.id === 'showcase-title') {
      const section = element.closest('section');
      if (section?.getAttribute('aria-labelledby') === element.id) {
        section.removeAttribute('aria-labelledby');
        section.setAttribute('aria-label', 'Gallery photographs');
      }
    }
    element.remove();
  }
  function clean(root) {
    if (root.nodeType !== Node.ELEMENT_NODE) return;
    if (root.matches(removeSelectors)) { removeBlock(root); return; }
    root.querySelectorAll(removeSelectors).forEach(removeBlock);
  }
  function cleanSharedCopy() {
    const title = document.title.replace(/\s*[—–-]?\s*A codex worn on the body\.?/gi, '').trim();
    if (title !== document.title) document.title = title;
    for (const paragraph of document.querySelectorAll('footer p')) {
      for (const node of paragraph.childNodes) {
        if (node.nodeType === Node.TEXT_NODE && /A codex worn on the body\.?/i.test(node.data)) {
          node.data = node.data.replace(/\s*A codex worn on the body\.?/gi, '');
        }
      }
    }
    const page = document.body?.dataset.page;
    const main = document.querySelector('main');
    if (main && (page === 'gallery' || page === 'archive')) {
      const label = page === 'gallery' ? 'Gallery' : 'Archive';
      if (main.getAttribute('aria-label') !== label) main.setAttribute('aria-label', label);
    }
  }
  clean(document.documentElement);
  cleanSharedCopy();
  new MutationObserver(records => {
    for (const record of records) {
      if (record.type === 'childList') for (const node of record.addedNodes) clean(node);
    }
    cleanSharedCopy();
  }).observe(document.documentElement, {subtree: true, childList: true});
})();
