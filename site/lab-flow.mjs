const $ = id => document.getElementById(id);
const STEPS = ['garment', 'construction', 'color', 'art', 'size', 'review'];

export function createLabFlow({ getBaseMode, validate, onBrowse }) {
  let current = 'garment', browsing = false;
  const completed = new Set();
  function message(text = '') { if ($('flow-status')) $('flow-status').textContent = text; }
  function refresh() {
    const build = (document.body.dataset.labTab || 'build') === 'build';
    document.body.classList.toggle('lab-flow-build', build);
    document.body.classList.toggle('lab-all-options', build);
    document.body.classList.remove('lab-reveal');
    document.body.dataset.baseMode = getBaseMode();
    document.body.dataset.labStep = 'all';
    for (const step of STEPS) {
      const panel = $('step-' + step);
      if (panel) { panel.hidden = false; panel.classList.add('is-current'); panel.classList.remove('is-complete'); }
    }
    if ($('flow-step-label')) $('flow-step-label').textContent = 'Your garment';
    if ($('lab-progress')) $('lab-progress').hidden = true;
    if ($('share-design')) $('share-design').hidden = false;
    if ($('add-to-cart')) $('add-to-cart').hidden = false;
    if ($('picker')) $('picker').hidden = !browsing;
    document.body.classList.toggle('flow-graphics-open', browsing);
  }
  function show(step, { focus = true } = {}) {
    if (!STEPS.includes(step)) return;
    current = step; refresh();
    if (focus && !browsing) {
      const legend = $('step-' + step)?.querySelector('legend');
      if (legend) { legend.tabIndex = -1; legend.focus({ preventScroll: true }); legend.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }
    }
  }
  function complete(step) { completed.add(step); message(); refresh(); return true; }
  function revoke(step) { completed.delete(step); refresh(); }
  function restore(steps) { for (const step of steps) completed.add(step); refresh(); }
  const graphics = $('graphics-dialog');
  function browse(on = true) {
    browsing = !!on;
    refresh(); onBrowse?.(browsing);
    if (on) { if (!graphics?.open) graphics?.showModal(); $('graphics-close')?.focus({ preventScroll: true }); }
    else { if (graphics?.open) graphics.close(); $('flow-browse')?.focus({ preventScroll: true }); }
  }
  $('flow-browse')?.addEventListener('click', () => browse(true));
  $('flow-art-back')?.addEventListener('click', () => browse(false));
  $('graphics-close')?.addEventListener('click', () => browse(false));
  graphics?.addEventListener('close', () => { if (browsing) { browsing = false; refresh(); $('flow-browse')?.focus({ preventScroll: true }); } });

  const dialog = $('placement-dialog');
  $('flow-placement')?.addEventListener('click', () => {
    if (!dialog?.open) dialog?.showModal();
    $('placement-close')?.focus({ preventScroll: true });
  });
  $('placement-close')?.addEventListener('click', () => dialog?.close());
  dialog?.addEventListener('click', event => {
    if (event.target !== dialog) return;
    const rect = dialog.getBoundingClientRect();
    if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) dialog.close();
  });
  dialog?.addEventListener('close', () => $('flow-placement')?.focus({ preventScroll: true }));

  const notes = $('flow-order-notes');
  try { if (notes) notes.value = sessionStorage.getItem('btr-cart-note') || ''; } catch {}
  function syncNotes() {
    if (!notes) return;
    const value = notes.value.slice(0, 500);
    try { sessionStorage.setItem('btr-cart-note', value); } catch {}
    const cartNote = $('cart-note');
    if (cartNote && cartNote.value !== value) { cartNote.value = value; cartNote.dispatchEvent(new Event('input', { bubbles: true })); }
  }
  notes?.addEventListener('input', syncNotes);
  document.addEventListener('input', event => { if (event.target.id === 'cart-note' && notes) notes.value = event.target.value; });
  return { show, refresh, browse, message, syncNotes, complete, revoke, restore, isCompleted: step => completed.has(step), get isBrowsing() { return browsing; }, get current() { return current; } };
}
