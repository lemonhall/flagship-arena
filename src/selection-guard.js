/** A combat popup accepts a fresh gesture only after held/repeated input ends. */
export class SelectionGuard {
  constructor(panel, quietMs = 450) {
    this.panel = panel; this.quietMs = quietMs;
    this.pointers = new Set(); this.keys = new Set();
    this.active = false; this.ready = false; this.timer = null;
    document.addEventListener('pointerdown', e => { this.pointers.add(e.pointerId); this.schedule(); }, true);
    for (const type of ['pointerup', 'pointercancel']) document.addEventListener(type, e => {
      this.pointers.delete(e.pointerId); this.schedule();
    }, true);
    document.addEventListener('keydown', e => { this.keys.add(e.code); this.schedule(); }, true);
    document.addEventListener('keyup', e => { this.keys.delete(e.code); this.schedule(); }, true);
    addEventListener('blur', () => { this.pointers.clear(); this.keys.clear(); this.schedule(); });
    panel.addEventListener('click', e => {
      if (this.active && !this.ready) { e.preventDefault(); e.stopImmediatePropagation(); }
    }, true);
  }
  arm() {
    this.active = true; this.ready = false;
    this.panel.dataset.inputReady = 'false';
    this.panel.querySelectorAll('button').forEach(button => { button.disabled = true; });
    this.panel.focus({ preventScroll: true });
    this.schedule();
  }
  schedule() {
    if (!this.active || this.ready) return;
    clearTimeout(this.timer);
    if (this.pointers.size || this.keys.size) return;
    this.timer = setTimeout(() => {
      this.ready = true; this.panel.dataset.inputReady = 'true';
      this.panel.querySelectorAll('button').forEach(button => { button.disabled = false; });
    }, this.quietMs);
  }
  close() { clearTimeout(this.timer); this.active = false; this.ready = false; }
}
