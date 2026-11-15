// Select the product layout before the shared Lab styles paint.
(() => {
  const path = location.pathname.replace(/\/$/, '');
  const mode = path === '/random-shirt' ? 'random' : path === '/mystery-box' ? 'mystery' : null;
  if (!mode) return;
  document.documentElement.dataset.labProduct = mode;
  document.title = 'BREAKTHYRULE — ' + (mode === 'random' ? 'Random Shirt' : 'Mystery Box');
})();
