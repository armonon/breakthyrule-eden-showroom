// Native page navigation keeps each item in browser history. Direct links still
// have a useful collection destination when there is no previous site page.
let previousSitePage = false;
try { previousSitePage = !!document.referrer && new URL(document.referrer).origin === location.origin; } catch {}
document.addEventListener('click', event => {
  if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return;
  const link = event.target instanceof Element ? event.target.closest('a[data-product-back]') : null;
  if (!link || link.target || !previousSitePage || history.length < 2) return;
  event.preventDefault();
  history.back();
});
