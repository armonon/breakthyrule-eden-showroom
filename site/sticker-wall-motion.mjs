// The wall changes only while it is visible and nobody is using it.
export function createWallMotion({ wall, button, shuffle, rearrange, isBusy = () => false, interval = 9000 }) {
  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  const surface = wall.closest('.sticker-board') || wall;
  let choice = null, visible = false, hovered = false, held = false;
  let timer = 0, cycle = 0, destroyed = false;
  const cleanups = [];
  const enabled = () => choice ?? !motion.matches;
  const listen = (target, type, listener, options) => {
    target.addEventListener(type, listener, options);
    cleanups.push(() => target.removeEventListener(type, listener, options));
  };
  const clear = () => { clearTimeout(timer); timer = 0; };
  const resting = () => !hovered && !held && !wall.contains(document.activeElement) && !document.body.classList.contains('sticker-dragging');
  function update() {
    button.textContent = enabled() ? 'Ⅱ' : '▶';
    button.setAttribute('aria-pressed', String(enabled()));
    button.setAttribute('aria-label', enabled() ? 'Pause automatic sticker wall' : 'Play automatic sticker wall');
    button.title = enabled() ? 'Pause wall' : 'Play wall';
    wall.dataset.autoWall = enabled() ? 'on' : 'off';
    wall.closest('.sticker-board')?.classList.toggle('wall-motion-paused', !enabled());
  }
  function restart(delay = interval) {
    clear();
    if (destroyed || !enabled() || !visible || document.hidden || !resting()) return;
    timer = setTimeout(() => {
      timer = 0;
      if (destroyed || !enabled() || !visible || document.hidden || !resting()) return;
      if (isBusy() || document.querySelector('dialog[open]')) { restart(1000); return; }
      cycle++;
      if (cycle % 2) shuffle(); else rearrange();
      wall.dataset.wallCycle = String(cycle);
      restart();
    }, delay);
  }
  listen(button, 'click', () => { choice = !enabled(); update(); restart(); });
  listen(surface, 'pointerenter', event => {
    if (event.pointerType === 'touch') return;
    hovered = true; clear();
  });
  listen(surface, 'pointerleave', event => {
    if (event.pointerType === 'touch') return;
    hovered = false; restart();
  });
  listen(surface, 'pointerdown', () => { held = true; clear(); }, { passive: true });
  const release = () => { if (held) { held = false; restart(); } };
  listen(window, 'pointerup', release, { passive: true });
  listen(window, 'pointercancel', release, { passive: true });
  listen(wall, 'focusin', clear);
  listen(wall, 'focusout', () => queueMicrotask(() => restart()));
  listen(window, 'blur', () => { held = false; hovered = false; clear(); });
  listen(window, 'focus', () => restart());
  listen(document, 'visibilitychange', () => { if (document.hidden) clear(); else restart(); });
  listen(motion, 'change', () => { update(); restart(); });
  const observer = new IntersectionObserver(entries => {
    visible = entries.some(entry => entry.isIntersecting && entry.intersectionRatio >= .15);
    restart();
  }, { threshold: [0, .15] });
  observer.observe(wall);
  update();
  return {
    restart,
    destroy() { destroyed = true; clear(); observer.disconnect(); cleanups.forEach(cleanup => cleanup()); }
  };
}
