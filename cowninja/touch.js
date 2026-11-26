// Touch controls for COWNinja: a stick on the left for W/A/S/D, buttons on the right, and dragging anywhere else to
// look. They write into the same key set the keyboard uses, so the game cannot tell the difference.
export function createTouch({ root, keys, onAct, onWhistle, onLook, onAttack, onGuard, onThrow }) {
  const coarse = matchMedia?.('(pointer: coarse)').matches || 'ontouchstart' in window;
  if (!coarse || !root) return { active: false };
  root.hidden = false; document.getElementById('cn-app')?.classList.add('cn-touching');
  root.innerHTML = `<div class="cn-stick" data-stick><i></i></div>
    <div class="cn-pad"><button data-key="shift">RUN</button><button data-tap="act">USE</button><button data-key="space">JUMP</button><button data-key="crouch">LOW</button><button data-tap="whistle">CALL</button><button data-tap="throw">THROW</button><button data-hold="attack">HIT</button><button data-hold="guard">BLOCK</button></div>`;
  const stick = root.querySelector('[data-stick]'), knob = stick.firstElementChild;
  let stickId = null, lookId = null, lx = 0, ly = 0;
  const setStick = (dx, dy) => {
    const r = 46, d = Math.hypot(dx, dy) || 1, k = Math.min(1, d / r); dx = dx / d * k; dy = dy / d * k; knob.style.transform = `translate(${dx * r}px, ${dy * r}px)`;
    for (const [key, on] of [['w', dy < -.35], ['s', dy > .35], ['a', dx < -.35], ['d', dx > .35]]) on ? keys.add(key) : keys.delete(key);
  };
  stick.addEventListener('pointerdown', e => { stickId = e.pointerId; stick.setPointerCapture(e.pointerId); move(e); e.preventDefault(); });
  const move = e => { const b = stick.getBoundingClientRect(); setStick(e.clientX - (b.left + b.width / 2), e.clientY - (b.top + b.height / 2)); };
  stick.addEventListener('pointermove', e => { if (e.pointerId === stickId) move(e); });
  const release = e => { if (e.pointerId === stickId) { stickId = null; knob.style.transform = ''; for (const k of ['w', 'a', 's', 'd']) keys.delete(k); } };
  stick.addEventListener('pointerup', release); stick.addEventListener('pointercancel', release);
  for (const b of root.querySelectorAll('button')) {
    const key = b.dataset.key, tap = b.dataset.tap, hold = b.dataset.hold, held = down => (hold === 'attack' ? onAttack : onGuard)?.(down);
    b.addEventListener('pointerdown', e => { e.preventDefault(); b.classList.add('on'); if (key) keys.add(key); else if (hold) held(true); else if (tap === 'act') onAct?.(); else if (tap === 'throw') onThrow?.(); else onWhistle?.(); });
    const up = () => { if (!b.classList.contains('on')) return; b.classList.remove('on'); if (key) keys.delete(key); else if (hold) held(false); };
    b.addEventListener('pointerup', up); b.addEventListener('pointercancel', up); b.addEventListener('pointerleave', up);
  }
  // Look: a drag that starts on the scene itself.
  const scene = document.getElementById('scene');
  scene.addEventListener('pointerdown', e => { if (e.pointerType !== 'touch' || lookId !== null) return; lookId = e.pointerId; lx = e.clientX; ly = e.clientY; });
  scene.addEventListener('pointermove', e => { if (e.pointerId !== lookId) return; onLook?.((e.clientX - lx) * 2.2, (e.clientY - ly) * 2.2); lx = e.clientX; ly = e.clientY; });
  const endLook = e => { if (e.pointerId === lookId) lookId = null; };
  scene.addEventListener('pointerup', endLook); scene.addEventListener('pointercancel', endLook);
  return { active: true };
}
