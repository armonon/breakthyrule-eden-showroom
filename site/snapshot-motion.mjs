// A paper change is temporary: the real cards keep the drag module's positions,
// rotation and stacking. Only owned WAAPI effects and inert old-paper copies move.
export function setupSnapshotMotion({ layer, motion } = {}) {
  const noop = { capture: () => null, play() {}, settle() {}, destroy() {} };
  if (!layer) return noop;
  const doc = layer.ownerDocument, win = doc.defaultView;
  const reduced = motion || win.matchMedia('(prefers-reduced-motion: reduce)');
  const cards = [...layer.querySelectorAll(':scope > button.photo-main,:scope > button.photo-companion')];
  const cardSet = new Set(cards), cleanups = [];
  let generation = 0, pending = null, active = null, destroyed = false;
  const listen = (target, type, handler, options) => {
    target.addEventListener(type, handler, options);
    cleanups.push(() => target.removeEventListener(type, handler, options));
  };
  const actualCard = target => cardSet.has(target?.closest?.('button'));
  const baseTransform = style => style.transform === 'none' ? 'matrix(1,0,0,1,0,0)' : style.transform;
  function clearActive() {
    const run = active; active = null;
    if (!run) return;
    clearTimeout(run.timeout);
    run.animations.forEach(animation => { try { animation.cancel(); } catch {} });
    run.overlay.remove();
    if (run.addedClass) layer.classList.remove('is-changing');
  }
  function settle() {
    generation++; pending = null; clearActive();
  }
  function paperCopy(card, style) {
    const ghost = doc.createElement('div');
    ghost.className = card.className + ' snapshot-ghost snapshot-exit';
    ghost.classList.remove('is-dragging', 'is-positioned');
    ghost.setAttribute('aria-hidden', 'true'); ghost.inert = true; ghost.tabIndex = -1;
    for (const child of card.childNodes) ghost.append(child.cloneNode(true));
    for (const element of ghost.querySelectorAll('*')) {
      for (const attribute of ['id', 'aria-labelledby', 'aria-describedby', 'aria-controls', 'aria-owns', 'aria-activedescendant', 'autofocus']) element.removeAttribute(attribute);
      if (element.matches('img')) { element.alt = ''; element.draggable = false; }
      if (element.matches('a,button,input,select,textarea,[tabindex],[contenteditable]')) {
        element.tabIndex = -1; element.removeAttribute('contenteditable');
        if ('disabled' in element) element.disabled = true;
      }
    }
    // Copy the actual paper finish, including user-adjusted stacking. Explicit
    // geometry prevents percentage/right/bottom rules from repositioning a copy.
    for (const property of ['box-sizing', 'padding', 'border', 'border-radius', 'background', 'box-shadow', 'color', 'font', 'letter-spacing', 'text-align', 'filter', 'opacity', 'transform-origin', 'translate', 'scale']) {
      ghost.style.setProperty(property, style.getPropertyValue(property));
    }
    Object.assign(ghost.style, {
      position: 'absolute', left: card.offsetLeft + 'px', top: card.offsetTop + 'px',
      right: 'auto', bottom: 'auto', width: card.offsetWidth + 'px', height: card.offsetHeight + 'px',
      minWidth: '0', minHeight: '0', maxWidth: 'none', maxHeight: 'none', margin: '0',
      boxSizing: 'border-box', transform: baseTransform(style), zIndex: style.zIndex,
      animation: 'none', transition: 'none', pointerEvents: 'none', userSelect: 'none'
    });
    return ghost;
  }
  function capture() {
    settle();
    if (destroyed || reduced.matches || doc.hidden || !layer.clientWidth || !layer.clientHeight || cards.some(card => card.classList.contains('is-dragging'))) return null;
    const frames = cards.filter(card => card.isConnected && !card.hidden).map(card => {
      const style = win.getComputedStyle(card);
      return { card, ghost: paperCopy(card, style), transform: baseTransform(style), shadow: style.boxShadow,
        opacity: style.opacity, top: card.offsetTop, height: card.offsetHeight };
    });
    if (!frames.length) return null;
    pending = { generation, frames, width: layer.clientWidth, height: layer.clientHeight };
    return pending;
  }
  function play(snapshot) {
    if (destroyed || !snapshot || snapshot !== pending || snapshot.generation !== generation) return;
    pending = null;
    if (reduced.matches || doc.hidden || !layer.isConnected) return;
    const overlay = doc.createElement('div');
    overlay.className = 'snapshot-flight-layer'; overlay.setAttribute('aria-hidden', 'true'); overlay.inert = true;
    Object.assign(overlay.style, { position: 'absolute', inset: '0', overflow: 'clip', pointerEvents: 'none', zIndex: '1', isolation: 'isolate', perspective: '1000px' });
    const run = { overlay, animations: [], timeout: null, addedClass: !layer.classList.contains('is-changing') };
    active = run; layer.classList.add('is-changing');
    overlay.append(...snapshot.frames.map(frame => frame.ghost)); layer.append(overlay);
    const small = snapshot.width <= 480;
    const fallDuration = 820, arrivalDuration = 800, staggerStep = 160;
    const lastStagger = Math.max(0, snapshot.frames.length - 1) * staggerStep;
    // Clear every old print before any new paper appears, with a brief beat.
    const arrivalStart = fallDuration + lastStagger + 80;
    const finish = () => { if (active === run) clearActive(); };
    try {
      snapshot.frames.forEach((frame, index) => {
        const { card, ghost, transform: base, shadow, opacity } = frame;
        const side = index % 2 ? 1 : -1, stagger = index * staggerStep;
        const peel = side * (small ? 6 : 10), drift = side * (small ? 22 : 55);
        const drop = snapshot.height - frame.top + frame.height + 45;
        // Peel a corner into the light, hang for a beat, then accelerate down.
        // The old image stays readable until its paper is well into the fall.
        const outgoing = ghost.animate([
          { offset: 0, transform: base, opacity, boxShadow: shadow, easing: 'ease-out' },
          { offset: .19, transform: `translate3d(${side * 5}px,-9px,30px) rotateX(16deg) rotateY(${peel}deg) rotate(${peel * .45}deg) ${base}`, opacity, boxShadow: '5px 14px 16px rgba(35,20,8,.25)', easing: 'ease-in' },
          { offset: .43, transform: `translate3d(${drift * .35}px,30px,38px) rotateX(-9deg) rotateY(${peel * 1.5}deg) rotate(${peel}deg) ${base}`, opacity, boxShadow: '8px 22px 22px rgba(35,20,8,.2)', easing: 'cubic-bezier(.48,.03,.82,.47)' },
          { offset: .76, transform: `translate3d(${drift * .75}px,${drop * .4}px,15px) rotateX(16deg) rotate(${side * (small ? 19 : 31)}deg) ${base}`, opacity: Number(opacity) * .96, boxShadow: '6px 28px 24px rgba(35,20,8,.12)', easing: 'ease-in' },
          { offset: 1, transform: `translate3d(${drift}px,${drop}px,0) rotateX(28deg) rotate(${side * (small ? 34 : 57)}deg) ${base}`, opacity: 0, boxShadow: '0 30px 25px rgba(35,20,8,0)' }
        ], { duration: fallDuration, delay: stagger, fill: 'both' });
        // A new print arrives large and light, hits the scene, and settles with
        // one small paper bounce. Ending at the exact base preserves manual drag.
        const launchX = -side * (small ? 17 : 36), launchY = small ? -42 : -82;
        const incoming = card.animate([
          { offset: 0, transform: `translate3d(${launchX}px,${launchY}px,0) rotate(${-side * (small ? 6 : 11)}deg) scale(${small ? 1.16 : 1.28}) ${base}`, opacity: 0, boxShadow: '9px 20px 26px rgba(35,20,8,.2)', easing: 'ease-out' },
          { offset: .12, transform: `translate3d(${launchX * .85}px,${launchY * .8}px,0) rotate(${-side * (small ? 5 : 9)}deg) scale(${small ? 1.13 : 1.23}) ${base}`, opacity, boxShadow: '8px 17px 23px rgba(35,20,8,.24)', easing: 'cubic-bezier(.6,.02,.88,.4)' },
          { offset: .54, transform: `translate3d(0,2px,0) scale(1.035,.95) ${base}`, opacity, boxShadow: '1px 2px 2px rgba(35,20,8,.3)', easing: 'ease-out' },
          { offset: .72, transform: `translate3d(0,${small ? -3 : -6}px,0) scale(${small ? 1.015 : 1.035}) ${base}`, opacity, boxShadow: '3px 7px 10px rgba(35,20,8,.18)', easing: 'ease-in-out' },
          { offset: .88, transform: `translate3d(0,1px,0) scale(.995) ${base}`, opacity, boxShadow: shadow, easing: 'ease-out' },
          { offset: 1, transform: base, opacity, boxShadow: shadow }
        ], { duration: arrivalDuration, delay: arrivalStart + stagger, fill: 'backwards' });
        run.animations.push(outgoing, incoming);
      });
      Promise.allSettled(run.animations.map(animation => animation.finished)).then(finish);
      // Cleanup still happens if a browser throttles animation completion events.
      run.timeout = setTimeout(finish, arrivalStart + lastStagger + arrivalDuration + 100);
    } catch { finish(); }
  }
  // Capture phase is essential: settle transforms before the drag module takes
  // its pointer/key geometry, regardless of module registration order.
  listen(layer, 'pointerdown', event => { if (actualCard(event.target)) settle(); }, true);
  listen(layer, 'keydown', event => { if (actualCard(event.target) && /^(ArrowLeft|ArrowRight|ArrowUp|ArrowDown|Escape)$/.test(event.key)) settle(); }, true);
  listen(doc, 'visibilitychange', () => { if (doc.hidden) settle(); });
  listen(reduced, 'change', () => { if (reduced.matches) settle(); });
  listen(win, 'resize', settle);
  return {
    capture, play, settle,
    destroy() { if (destroyed) return; settle(); destroyed = true; cleanups.forEach(cleanup => cleanup()); }
  };
}
