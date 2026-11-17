// Keep scrolling native for touch and trackpads. Add the same drag and keyboard
// affordances to each photo strip without turning vertical wheel input sideways.
export function enableGalleryScroll(viewport, { label = 'Photo gallery', onInteract = () => {} } = {}) {
  viewport.tabIndex = 0;
  viewport.setAttribute('role', 'region');
  viewport.setAttribute('aria-label', `${label}. Swipe, drag, or use the left and right arrow keys to browse.`);
  viewport.dataset.galleryScrollable = 'true';
  let pointer = null, suppressClickUntil = 0, manualScrollUntil = 0;

  function interact(source = 'pointer') {
    manualScrollUntil = performance.now() + 500;
    onInteract(source);
  }
  viewport.addEventListener('pointerdown', event => {
    if (!event.isPrimary || event.button !== 0) return;
    interact();
    if (event.pointerType !== 'touch') {
      pointer = { id: event.pointerId, x: event.clientX, y: event.clientY, left: viewport.scrollLeft, dragging: false };
    }
  }, { passive: true });
  viewport.addEventListener('pointermove', event => {
    if (!pointer || event.pointerId !== pointer.id) return;
    const dx = event.clientX - pointer.x, dy = event.clientY - pointer.y;
    if (!pointer.dragging) {
      if (Math.abs(dx) < 7 || Math.abs(dx) <= Math.abs(dy)) return;
      pointer.dragging = true;
      viewport.dataset.galleryDragging = 'true';
      viewport.setPointerCapture(event.pointerId);
    }
    event.preventDefault();
    interact();
    viewport.scrollLeft = pointer.left - dx;
  });
  function release(event) {
    if (!pointer || event.pointerId !== pointer.id) return;
    if (pointer.dragging) {
      suppressClickUntil = performance.now() + 400;
      interact();
    }
    pointer = null;
    delete viewport.dataset.galleryDragging;
  }
  window.addEventListener('pointerup', release, { passive: true });
  window.addEventListener('pointercancel', release, { passive: true });
  viewport.addEventListener('lostpointercapture', release);
  viewport.addEventListener('dragstart', event => event.preventDefault());
  viewport.addEventListener('click', event => {
    if (performance.now() >= suppressClickUntil) return;
    suppressClickUntil = 0;
    event.preventDefault();
    event.stopImmediatePropagation();
  }, true);
  viewport.addEventListener('wheel', () => interact('wheel'), { passive: true });
  viewport.addEventListener('touchmove', () => interact('touch'), { passive: true });
  viewport.addEventListener('scroll', () => {
    // Extend the pause through native touch/trackpad momentum, but never treat
    // the gallery's own automatic movement as a fresh user interaction.
    if (performance.now() < manualScrollUntil) interact('scroll');
  }, { passive: true });
  viewport.addEventListener('keydown', event => {
    if (event.target !== viewport || event.altKey || event.ctrlKey || event.metaKey) return;
    const page = viewport.clientWidth * .85;
    const left = {
      ArrowLeft: viewport.scrollLeft - page,
      ArrowRight: viewport.scrollLeft + page,
      Home: 0,
      End: viewport.scrollWidth - viewport.clientWidth
    }[event.key];
    if (left === undefined) return;
    event.preventDefault();
    interact('keyboard');
    viewport.scrollTo({ left, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
  });
}
