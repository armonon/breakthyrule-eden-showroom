let pickerSequence = 0;

// The dialog owns only its own UI; the lab remains responsible for chosen graphics.
export function createGraphicPicker({ items = [], onPick = () => {}, getSelected = () => [], onClose = () => {} } = {}) {
  const doc = document, id = `graphic-picker-${++pickerSequence}`;
  const dialog = doc.createElement('dialog');
  dialog.className = 'graphic-picker';
  dialog.setAttribute('aria-labelledby', `${id}-title`);

  const head = doc.createElement('header');
  head.className = 'graphic-picker-head';
  const title = doc.createElement('h2');
  title.id = `${id}-title`;
  title.textContent = 'All graphics';
  const closeButton = doc.createElement('button');
  closeButton.type = 'button';
  closeButton.className = 'graphic-picker-close';
  closeButton.textContent = 'Close ×';
  closeButton.setAttribute('aria-label', 'Close graphics picker');
  closeButton.autofocus = true;
  head.append(title, closeButton);

  const searchLabel = doc.createElement('label');
  searchLabel.className = 'graphic-picker-search';
  const searchText = doc.createElement('span');
  searchText.textContent = 'Search graphics';
  const search = doc.createElement('input');
  search.type = 'search';
  search.placeholder = 'Filter by name (optional)';
  search.autocomplete = 'off';
  search.spellcheck = false;
  search.setAttribute('aria-controls', `${id}-grid`);
  searchLabel.append(searchText, search);

  const count = doc.createElement('p');
  count.className = 'graphic-picker-count';
  count.setAttribute('role', 'status');
  count.setAttribute('aria-live', 'polite');
  count.setAttribute('aria-atomic', 'true');
  const grid = doc.createElement('div');
  grid.id = `${id}-grid`;
  grid.className = 'graphic-picker-grid';
  const empty = doc.createElement('p');
  empty.className = 'graphic-picker-empty';
  empty.textContent = 'No graphics match that search.';
  empty.hidden = true;
  dialog.append(head, searchLabel, count, grid, empty);

  const normalize = value => String(value ?? '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
  const entries = items.map(item => {
    const button = doc.createElement('button');
    button.type = 'button';
    button.className = 'graphic-picker-tile';
    button.tabIndex = -1;
    button.dataset.graphicId = String(item.id);
    const image = doc.createElement('img');
    image.alt = '';
    image.loading = 'lazy';
    image.decoding = 'async';
    image.draggable = false;
    image.width = 96;
    image.height = 96;
    if (item.thumb) image.src = item.thumb;
    const name = doc.createElement('span');
    name.textContent = item.name || String(item.id);
    button.append(image, name);
    grid.append(button);
    return { item, button, image, terms: normalize(`${item.name || ''} ${item.id}`) };
  });
  const byButton = new Map(entries.map(entry => [entry.button, entry]));
  let visible = entries, active = null, returnFocus = null, backdropDown = false;
  let destroyed = false, sessionOpen = false;
  const cleanups = [];
  const listen = (target, type, listener) => {
    target.addEventListener(type, listener);
    cleanups.push(() => target.removeEventListener(type, listener));
  };
  const tileFor = target => {
    const button = target?.closest?.('.graphic-picker-tile');
    return byButton.get(button);
  };
  function setActive(entry) {
    active = entry || null;
    for (const candidate of entries) candidate.button.tabIndex = candidate === active ? 0 : -1;
  }
  function selectedIds() {
    const value = getSelected();
    const values = Array.isArray(value) || value instanceof Set ? [...value] : value == null ? [] : [value];
    return new Set(values.map(String));
  }
  function loadFirstBatch() {
    // Prioritize the opening contact sheet; the rest of the complete library
    // stays in the grid and loads as it comes into view.
    for (const entry of visible.slice(0, 48)) entry.image.loading = 'eager';
  }
  function refresh() {
    if (destroyed) return;
    const selected = selectedIds(), words = normalize(search.value).split(/\s+/).filter(Boolean);
    visible = [];
    for (const entry of entries) {
      const chosen = selected.has(String(entry.item.id));
      entry.button.classList.toggle('is-selected', chosen);
      entry.button.setAttribute('aria-pressed', String(chosen));
      entry.button.hidden = !words.every(word => entry.terms.includes(word));
      if (!entry.button.hidden) visible.push(entry);
    }
    setActive(visible.includes(active) ? active : visible.find(entry => selected.has(String(entry.item.id))) || visible[0]);
    count.textContent = words.length ? `${visible.length} of ${entries.length} graphics` : `All ${entries.length} graphics`;
    empty.hidden = visible.length > 0;
    if (dialog.open) loadFirstBatch();
  }
  function finishClose() {
    if (!sessionOpen) return;
    sessionOpen = false;
    backdropDown = false;
    const target = returnFocus;
    returnFocus = null;
    if (target?.isConnected && typeof target.focus === 'function') target.focus({ preventScroll: true });
    onClose();
  }
  function close() {
    if (destroyed) return;
    if (dialog.open) dialog.close();
    finishClose();
  }
  function open(opener) {
    if (destroyed) return;
    const alreadyOpen = dialog.open;
    if (!alreadyOpen) returnFocus = opener && typeof opener.focus === 'function' ? opener : doc.activeElement;
    search.value = '';
    active = null;
    refresh();
    setActive(visible[0]);
    if (!alreadyOpen) dialog.showModal();
    sessionOpen = true;
    // Opening is a browsing action. Keeping focus away from the input leaves
    // the whole contact sheet visible instead of summoning a phone keyboard.
    closeButton.focus({ preventScroll: true });
    grid.scrollTop = 0;
    loadFirstBatch();
  }
  function outside(event) {
    const box = dialog.getBoundingClientRect();
    return event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom;
  }
  function columns() {
    if (!visible.length) return 1;
    const top = visible[0].button.getBoundingClientRect().top;
    let number = 0;
    for (const entry of visible) {
      if (Math.abs(entry.button.getBoundingClientRect().top - top) > 2) break;
      number++;
    }
    return Math.max(1, number);
  }
  function focusTile(entry) {
    if (!entry) return;
    setActive(entry);
    entry.button.focus({ preventScroll: true });
    // Scroll only the explicitly scrollable picker grid, never the page below it.
    const box = entry.button.getBoundingClientRect(), viewport = grid.getBoundingClientRect();
    if (box.top < viewport.top) grid.scrollTop += box.top - viewport.top;
    else if (box.bottom > viewport.bottom) grid.scrollTop += box.bottom - viewport.bottom;
  }
  listen(closeButton, 'click', close);
  listen(dialog, 'cancel', event => { event.preventDefault(); close(); });
  listen(dialog, 'keydown', event => {
    // A nonempty search input otherwise consumes the first Escape to clear itself.
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(); }
  });
  listen(dialog, 'close', () => { if (!dialog.open) finishClose(); });
  listen(dialog, 'pointerdown', event => { backdropDown = event.target === dialog && outside(event); });
  listen(dialog, 'pointercancel', () => { backdropDown = false; });
  listen(dialog, 'click', event => {
    const dismiss = backdropDown && event.target === dialog && outside(event);
    backdropDown = false;
    if (dismiss) close();
  });
  listen(search, 'input', refresh);
  listen(grid, 'focusin', event => { const entry = tileFor(event.target); if (entry) setActive(entry); });
  listen(grid, 'click', event => {
    const entry = tileFor(event.target);
    if (!entry || entry.button.hidden) return;
    onPick(entry.item.id);
    close();
  });
  listen(grid, 'keydown', event => {
    const entry = tileFor(event.target);
    if (!entry || event.altKey || event.ctrlKey || event.metaKey) return;
    const index = visible.indexOf(entry);
    let next;
    if (event.key === 'ArrowLeft') next = index - 1;
    else if (event.key === 'ArrowRight') next = index + 1;
    else if (event.key === 'ArrowUp') next = index - columns();
    else if (event.key === 'ArrowDown') next = index + columns();
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = visible.length - 1;
    else return;
    event.preventDefault();
    focusTile(visible[Math.max(0, Math.min(visible.length - 1, next))]);
  });
  doc.body.append(dialog);
  refresh();
  return {
    open, close, refresh,
    destroy() {
      if (destroyed) return;
      close();
      destroyed = true;
      cleanups.forEach(cleanup => cleanup());
      dialog.remove();
    }
  };
}
