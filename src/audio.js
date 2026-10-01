const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

export class BattleAudio {
  constructor() {
    this.enabled = true;
    this.context = null;
    this.lastShot = 0;
    this.bgmEnabled = true;
    try { this.bgmEnabled = localStorage.getItem('flagship-bgm-enabled') !== 'false'; } catch { /* optional persistence */ }
    this.activated = false;
    this.bgmVolume = this.readVolume();
    this.bgm = new Audio(`${import.meta.env.BASE_URL}audio/six_seas_bgm.mp3`);
    this.bgm.id = 'bgm-track';
    this.bgm.loop = true;
    this.bgm.preload = 'metadata';
    document.body.append(this.bgm);
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.bgm.pause(); else this.playBgm();
    });
  }
  readVolume() {
    try {
      const raw = localStorage.getItem('flagship-bgm-volume');
      if (raw === null || raw.trim() === '') return .6;
      const saved = Number(raw);
      return Number.isFinite(saved) ? clamp(saved, 0, 1) : .6;
    } catch { return .6; }
  }
  unlock() {
    this.activated = true;
    try {
      if (!this.context) {
        this.context = new (window.AudioContext || window.webkitAudioContext)();
        this.master = this.context.createGain(); this.master.gain.value = this.enabled ? .23 : 0; this.master.connect(this.context.destination);
        // iOS ignores HTMLMediaElement.volume; route music through its own Web Audio gain.
        this.bgmGain = this.context.createGain(); this.bgmGain.gain.value = this.bgmVolume;
        this.bgmSource = this.context.createMediaElementSource(this.bgm);
        this.bgmSource.connect(this.bgmGain).connect(this.context.destination);
        this.noise = this.context.createBuffer(1, this.context.sampleRate * 2, this.context.sampleRate);
        const d = this.noise.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      }
      if (this.context.state === 'suspended') this.context.resume().catch(() => {});
    } catch { this.enabled = false; }
    this.playBgm();
  }
  playBgm() {
    if (!this.activated || !this.bgmGain || !this.bgmEnabled || this.bgmVolume <= 0 || document.hidden || !this.bgm.paused) return;
    const promise = this.bgm.play();
    if (promise?.catch) promise.catch(() => {});
  }
  toggle() {
    this.enabled = !this.enabled;
    if (this.master) this.master.gain.value = this.enabled ? .23 : 0;
    if (this.enabled) this.unlock();
    return this.enabled;
  }
  setBgmVolume(value) {
    this.bgmVolume = clamp(Number(value) || 0, 0, 1);
    if (this.bgmGain) this.bgmGain.gain.setTargetAtTime(this.bgmVolume, this.context.currentTime, .025);
    try { localStorage.setItem('flagship-bgm-volume', String(this.bgmVolume)); } catch { /* private storage */ }
    if (this.bgmVolume <= 0) this.bgm.pause();
    else if (this.bgmEnabled) this.unlock();
    return this.bgmVolume;
  }
  toggleBgm() {
    this.bgmEnabled = !this.bgmEnabled;
    try { localStorage.setItem('flagship-bgm-enabled', String(this.bgmEnabled)); } catch { /* optional persistence */ }
    if (this.bgmEnabled) this.unlock(); else this.bgm.pause();
    return this.bgmEnabled;
  }
  events(events, player) {
    if (!this.enabled || !this.context || this.context.state !== 'running') return;
    for (const e of events) {
      const attenuation = e.pos ? Math.max(.08, 1 - Math.hypot(e.pos.x - player.pos.x, e.pos.y - player.pos.y) / 320) : 1;
      if (e.type === 'shot') {
        if (this.context.currentTime - this.lastShot < .035) continue;
        this.lastShot = this.context.currentTime;
        this.boom(e.heavy ? .4 : .28, attenuation * (e.heavy ? 1.05 : .9), e.heavy ? 520 : 780);
        this.tone(e.heavy ? 62 : 88, 28, e.heavy ? .34 : .22, attenuation);
      }
      if (e.type === 'sunk') { this.boom(1.2, attenuation * 1.4, 450); this.tone(60, 22, .8, attenuation); }
      if (e.type === 'hit' || e.type === 'blast') this.boom(.15, attenuation * .45, 1400);
      if (e.type === 'pickup' && e.id === 'p0') this.tone(e.kind === 'ammo' ? 650 : 880, 1200, .18, .25);
      if (e.type === 'boss') this.tone(110, 70, 1.1, .65);
      if (e.type === 'boss_charge' || e.type === 'boss_phase') { this.boom(.7, .6, 380); this.tone(75, 30, .8, .45); }
      if (e.type === 'boss_warning') { this.tone(175, 110, .45, .35); this.tone(265, 170, .45, .18); }
      if (e.type === 'chain_blast') { this.boom(.7, attenuation * 1.1, 520); this.tone(65, 24, .5, attenuation * .6); }
      if (e.type === 'result') this.tone(e.outcome === 'victory' ? 440 : 140, e.outcome === 'victory' ? 880 : 70, .7, .5);
    }
  }
  boom(duration, gain, cutoff) {
    const t = this.context.currentTime, source = this.context.createBufferSource(), filter = this.context.createBiquadFilter(), envelope = this.context.createGain();
    source.buffer = this.noise; filter.type = 'lowpass'; filter.frequency.setValueAtTime(cutoff, t); filter.frequency.exponentialRampToValueAtTime(80, t + duration);
    envelope.gain.setValueAtTime(gain, t); envelope.gain.exponentialRampToValueAtTime(.001, t + duration);
    source.connect(filter).connect(envelope).connect(this.master); source.start(t, Math.random() * .5, duration);
    source.onended = () => { source.disconnect(); filter.disconnect(); envelope.disconnect(); };
  }
  tone(start, end, duration, gain) {
    const t = this.context.currentTime, source = this.context.createOscillator(), envelope = this.context.createGain();
    source.frequency.setValueAtTime(start, t); source.frequency.exponentialRampToValueAtTime(end, t + duration);
    envelope.gain.setValueAtTime(gain, t); envelope.gain.exponentialRampToValueAtTime(.001, t + duration);
    source.connect(envelope).connect(this.master); source.start(t); source.stop(t + duration);
    source.onended = () => { source.disconnect(); envelope.disconnect(); };
  }
}
