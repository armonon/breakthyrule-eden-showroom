// Move the physical snapshot cards independently of the photographs cycling inside them.
// Root styles stop floating animation on .is-positioned and raise .is-dragging.
export function setupSnapshotDrag({ layer, onInteraction = () => {}, announce = () => {} } = {}) {
  if (!layer) return { reset() {}, destroy() {} };
  const doc = layer.ownerDocument, win = doc.defaultView;
  const cards = [...layer.querySelectorAll('button.photo-main,button.photo-companion')];
  const cardSet = new Set(cards), positions = new Map(), cleanups = [];
  const positionProperties = ['left', 'top', 'right', 'bottom', 'z-index'];
  const readStyle = (card, properties = positionProperties) => properties.map(name => [name, card.style.getPropertyValue(name), card.style.getPropertyPriority(name)]);
  const restoreStyle = (card, values) => values.forEach(([name, value, priority]) => value ? card.style.setProperty(name, value, priority) : card.style.removeProperty(name));
  const initial = new Map(cards.map(card => [card, {
    style: readStyle(card, [...positionProperties, 'touch-action']),
    placed: card.classList.contains('is-positioned'), dragging: card.classList.contains('is-dragging')
  }]));
  let drag = null, keyboard = null, keyboardTimer = null, clickToSuppress = null, interacting = false, destroyed = false, stackLevel = 10;
  const listen = (target, type, handler, options) => {
    target.addEventListener(type, handler, options);
    cleanups.push(() => target.removeEventListener(type, handler, options));
  };
  const cardFor = target => { const card = target?.closest?.('button'); return cardSet.has(card) ? card : null; };
  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
  function interaction() {
    const next = !!(drag || keyboard);
    if (next !== interacting) { interacting = next; onInteraction(next); }
  }
  function geometry(card) {
    const rect = layer.getBoundingClientRect(), width = layer.clientWidth, height = layer.clientHeight;
    const scaleX = width && rect.width ? rect.width / width : 1;
    const scaleY = height && rect.height ? rect.height / height : 1;
    const box = card.getBoundingClientRect(), cardWidth = card.offsetWidth, cardHeight = card.offsetHeight;
    // Rotated corners and the tape should stay clear of the scene's labels.
    const overX = Math.max(0, (box.width / scaleX - cardWidth) / 2);
    const overY = Math.max(0, (box.height / scaleY - cardHeight) / 2);
    const minX = 10 + overX, minY = 52 + overY + 8;
    return {
      rect, scaleX, scaleY, width, height,
      minX, minY,
      maxX: Math.max(minX, width - 10 - overX - cardWidth),
      maxY: Math.max(minY, height - 58 - overY - cardHeight),
      // The rectangle's center includes the current floating translation while
      // keeping the card's original rotation out of its left/top coordinates.
      left: (box.left + box.width / 2 - rect.left) / scaleX - cardWidth / 2,
      top: (box.top + box.height / 2 - rect.top) / scaleY - cardHeight / 2
    };
  }
  function place(card, left, top, save = true) {
    const g = geometry(card);
    if (!g.width || !g.height) return;
    const x = clamp(left, g.minX, g.maxX), y = clamp(top, g.minY, g.maxY);
    card.style.left = x.toFixed(2) + 'px'; card.style.top = y.toFixed(2) + 'px';
    card.style.right = 'auto'; card.style.bottom = 'auto';
    if (save) positions.set(card, {
      x: g.maxX > g.minX ? (x - g.minX) / (g.maxX - g.minX) : 0,
      y: g.maxY > g.minY ? (y - g.minY) / (g.maxY - g.minY) : 0
    });
  }
  function freeze(card) {
    const g = geometry(card);
    card.classList.add('is-positioned');
    place(card, g.left, g.top);
  }
  function movedMessage(card) {
    const p = positions.get(card);
    return p ? `Snapshot moved to ${Math.round(p.x * 100)}% across and ${Math.round(p.y * 100)}% down the stage.` : 'Snapshot moved.';
  }
  function finishKeyboard(silent = false) {
    clearTimeout(keyboardTimer); keyboardTimer = null;
    if (!keyboard) return;
    const card = keyboard; keyboard = null; interaction();
    if (!silent) announce(movedMessage(card));
  }
  function finishPointer(cancelled = false, silent = false) {
    if (!drag) return;
    const d = drag; drag = null;
    d.card.classList.remove('is-dragging');
    if (d.moved) {
      clickToSuppress = { card: d.card, id: d.id, until: performance.now() + 800 };
      if (cancelled) {
        restoreStyle(d.card, d.style);
        d.card.classList.toggle('is-positioned', d.wasPlaced);
        if (d.position) positions.set(d.card, d.position); else positions.delete(d.card);
      }
    }
    try { if (d.card.hasPointerCapture(d.id)) d.card.releasePointerCapture(d.id); } catch {}
    interaction();
    if (d.moved && !silent) announce(cancelled ? 'Snapshot move cancelled.' : movedMessage(d.card));
  }
  function pointerDown(event) {
    const card = cardFor(event.target);
    if (!card || drag || event.button !== 0 || event.isPrimary === false) return;
    finishKeyboard();
    const g = geometry(card);
    drag = {
      card, id: event.pointerId, startX: event.clientX, startY: event.clientY,
      grabX: (event.clientX - g.rect.left) / g.scaleX - g.left,
      grabY: (event.clientY - g.rect.top) / g.scaleY - g.top,
      threshold: event.pointerType === 'touch' ? 8 : 5, moved: false,
      style: readStyle(card), wasPlaced: card.classList.contains('is-positioned'), position: positions.get(card)
    };
    try { card.setPointerCapture(event.pointerId); } catch {}
    interaction();
  }
  function pointerMove(event) {
    if (!drag || event.pointerId !== drag.id) return;
    const d = drag;
    if (!d.moved) {
      if (Math.hypot(event.clientX - d.startX, event.clientY - d.startY) < d.threshold) return;
      d.moved = true;
      freeze(d.card);
      d.card.style.zIndex = String(++stackLevel);
      d.card.classList.add('is-dragging');
    }
    event.preventDefault();
    const g = geometry(d.card);
    place(d.card, (event.clientX - g.rect.left) / g.scaleX - d.grabX, (event.clientY - g.rect.top) / g.scaleY - d.grabY);
  }
  function keyDown(event) {
    if (event.key === 'Escape' && drag) { event.preventDefault(); event.stopPropagation(); finishPointer(true); return; }
    const delta = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[event.key];
    const card = cardFor(event.target);
    if (!delta || !card || event.altKey || event.ctrlKey || event.metaKey) return;
    event.preventDefault(); event.stopPropagation();
    if (drag) return;
    if (keyboard && keyboard !== card) finishKeyboard();
    keyboard = card; interaction();
    if (!card.classList.contains('is-positioned')) freeze(card);
    card.style.zIndex = String(++stackLevel);
    const step = event.shiftKey ? 32 : 8;
    place(card, parseFloat(card.style.left) + delta[0] * step, parseFloat(card.style.top) + delta[1] * step);
    clearTimeout(keyboardTimer);
    // Also recover when a platform or assistive technology omits keyup.
    keyboardTimer = setTimeout(() => finishKeyboard(), 250);
  }
  cards.forEach(card => { card.style.touchAction = 'none'; });
  listen(win, 'pointerdown', () => { clickToSuppress = null; }, true);
  listen(layer, 'pointerdown', pointerDown);
  listen(win, 'pointermove', pointerMove, { passive: false });
  listen(win, 'pointerup', event => { if (drag?.id === event.pointerId) finishPointer(); });
  listen(win, 'pointercancel', event => { if (drag?.id === event.pointerId) finishPointer(true); });
  listen(layer, 'lostpointercapture', event => { if (drag?.id === event.pointerId) finishPointer(true); });
  listen(layer, 'dragstart', event => { if (cardFor(event.target)) event.preventDefault(); });
  // Capture before existing photo-open handlers, including a release outside a card.
  listen(doc, 'click', event => {
    const d = clickToSuppress;
    if (!d || event.detail === 0) return;
    if (performance.now() > d.until) { clickToSuppress = null; return; }
    if (event.pointerId === d.id || d.card.contains(event.target)) {
      clickToSuppress = null; event.preventDefault(); event.stopImmediatePropagation();
    }
  }, true);
  listen(layer, 'keydown', keyDown);
  listen(win, 'keyup', event => { if (event.key.startsWith('Arrow')) finishKeyboard(); });
  listen(layer, 'focusout', event => { if (keyboard === cardFor(event.target)) finishKeyboard(); });
  listen(win, 'blur', () => { finishPointer(true); finishKeyboard(); });
  listen(doc, 'visibilitychange', () => { if (doc.hidden) { finishPointer(true); finishKeyboard(); } });
  let sizes = new Map([layer, ...cards].map(element => [element, [element.clientWidth, element.clientHeight]]));
  function resize() {
    if (destroyed || !layer.clientWidth || !layer.clientHeight) return;
    const next = new Map([layer, ...cards].map(element => [element, [element.clientWidth, element.clientHeight]]));
    if (![...next].some(([element, size]) => size.some((value, index) => value !== sizes.get(element)?.[index]))) return;
    finishPointer(true); finishKeyboard(); sizes = next;
    for (const [card, position] of positions) {
      const g = geometry(card);
      place(card, g.minX + position.x * (g.maxX - g.minX), g.minY + position.y * (g.maxY - g.minY), false);
    }
  }
  const observer = new ResizeObserver(resize);
  [layer, ...cards].forEach(element => observer.observe(element));
  return {
    reset() {
      if (destroyed) return;
      finishPointer(true, true); finishKeyboard(true); positions.clear(); clickToSuppress = null; stackLevel = 10;
      for (const [card, original] of initial) {
        restoreStyle(card, original.style.filter(([name]) => name !== 'touch-action'));
        card.classList.toggle('is-positioned', original.placed);
        card.classList.remove('is-dragging');
      }
      announce('Snapshot layout reset.');
    },
    destroy() {
      if (destroyed) return;
      finishPointer(true, true); finishKeyboard(true); destroyed = true; observer.disconnect();
      cleanups.forEach(cleanup => cleanup()); positions.clear(); clickToSuppress = null;
      for (const [card, original] of initial) {
        restoreStyle(card, original.style);
        card.classList.toggle('is-positioned', original.placed); card.classList.toggle('is-dragging', original.dragging);
      }
    }
  };
}
