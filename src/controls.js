import { clamp } from './sim.js';

export class Controls {
  constructor(onPause, onGesture) {
    this.keys = new Set(); this.stick = null; this.fireId = null; this.boostTap = false; this.cycleTap = false; this.enabled = false;
    this.pad = document.querySelector('#stick'); this.knob = this.pad.querySelector('i'); this.fire = document.querySelector('#fire');
    // WebKit can recognize zoom independently of pointerdown.preventDefault().
    // Consume native touches only on gameplay surfaces; overlays keep scrolling.
    const preventGesture = e => { if (e.cancelable) e.preventDefault(); };
    for (const surface of document.querySelectorAll('#battle, #stick, #fire, #boost, #target')) {
      for (const type of ['touchstart', 'touchmove', 'touchend', 'dblclick'])
        surface.addEventListener(type, preventGesture, { passive: false });
    }
    for (const type of ['gesturestart', 'gesturechange', 'gestureend']) document.addEventListener(type, e => {
      if (this.enabled || e.target.closest?.('#battle, #stick, #fire, #boost, #target')) preventGesture(e);
    }, { passive: false });
    const controlKeys = ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowLeft', 'ArrowDown', 'ArrowRight', 'Space', 'KeyQ', 'ShiftLeft', 'ShiftRight'];
    addEventListener('keydown', e => {
      if (e.code === 'Escape' && !e.repeat) { onPause(); return; }
      if (e.target.closest?.('input, select, button')) return;
      if (!this.enabled || !controlKeys.includes(e.code)) return;
      e.preventDefault(); this.keys.add(e.code); onGesture();
    });
    addEventListener('keyup', e => this.keys.delete(e.code));
    this.pad.addEventListener('pointerdown', e => {
      if (!this.enabled || this.stick) return; e.preventDefault(); onGesture();
      this.pad.setPointerCapture(e.pointerId); this.stick = { id: e.pointerId, x: 0, y: 0 }; this.move(e);
    });
    this.pad.addEventListener('pointermove', e => { if (this.stick?.id === e.pointerId) this.move(e); });
    for (const name of ['pointerup', 'pointercancel', 'lostpointercapture']) {
      this.pad.addEventListener(name, e => { if (this.stick?.id === e.pointerId) { this.stick = null; this.knob.style.transform = ''; } });
      this.fire.addEventListener(name, e => { if (this.fireId === e.pointerId) { this.fireId = null; this.fire.classList.remove('active'); } });
    }
    this.fire.addEventListener('pointerdown', e => {
      if (!this.enabled || this.fireId !== null) return; e.preventDefault(); onGesture();
      this.fire.setPointerCapture(e.pointerId); this.fireId = e.pointerId; this.fire.classList.add('active');
    });
    document.querySelector('#boost').addEventListener('pointerdown', () => { if (this.enabled) { this.boostTap = true; onGesture(); } });
    const target = document.querySelector('#target');
    target.addEventListener('pointerdown', e => {
      if (!this.enabled) return;
      e.preventDefault(); this.cycleTap = true; onGesture();
    });
    // Native touch clicks are suppressed above; retain keyboard activation.
    target.addEventListener('click', e => { if (this.enabled && e.detail === 0) this.cycleTap = true; });
    addEventListener('blur', () => { this.clear(); onPause(true); });
    document.addEventListener('visibilitychange', () => { if (document.hidden) { this.clear(); onPause(true); } });
  }
  move(e) {
    const r = this.pad.getBoundingClientRect(), dx = (e.clientX - r.left - r.width / 2) / (r.width * .37), dy = (e.clientY - r.top - r.height / 2) / (r.height * .37);
    const n = Math.max(1, Math.hypot(dx, dy)); this.stick.x = dx / n; this.stick.y = dy / n;
    this.knob.style.transform = `translate(${this.stick.x * 32}px,${this.stick.y * 32}px)`;
  }
  read() {
    const has = (...keys) => keys.some(k => this.keys.has(k));
    const cmd = { steer: this.stick ? this.stick.x : Number(has('KeyD', 'ArrowRight')) - Number(has('KeyA', 'ArrowLeft')),
      throttle: this.stick ? clamp(.6 - this.stick.y, -.35, 1) : has('KeyW', 'ArrowUp') ? 1 : has('KeyS', 'ArrowDown') ? -.3 : .6,
      fire: this.fireId !== null || has('Space'), boost: this.boostTap || has('ShiftLeft', 'ShiftRight'), cycle: this.cycleTap || has('KeyQ') };
    this.boostTap = false; this.cycleTap = false; return cmd;
  }
  clear() { this.keys.clear(); this.stick = null; this.fireId = null; this.boostTap = false; this.cycleTap = false; this.knob.style.transform = ''; this.fire.classList.remove('active'); }
}
