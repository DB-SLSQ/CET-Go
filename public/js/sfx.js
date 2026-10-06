/* ============================================================
   CET Go · 8-bit 音效（Web Audio 实时合成，零音频文件）
   ============================================================ */
const SFX = {
  ctx: null,
  on: true,

  _ensure() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      this.ctx = new AC();
    }
    if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
    return this.ctx;
  },

  /* 由用户手势触发一次，解锁 AudioContext */
  unlock() { this._ensure(); },

  tone(freq, dur = 0.1, type = 'square', vol = 0.12, delay = 0, slideTo = null) {
    if (!this.on) return;
    const ctx = this._ensure();
    if (!ctx) return;
    const t0 = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(40, slideTo), t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g);
    g.connect(ctx.destination);
    osc.start(t0);
    osc.stop(t0 + dur + 0.04);
  },

  /* ---- 语义化音效 ---- */
  correct(combo = 1) {
    const b = 640;
    this.tone(b, 0.07, 'square', 0.10);
    this.tone(b * 1.335, 0.09, 'square', 0.10, 0.055);
    if (combo >= 3) this.tone(b * 2, 0.10, 'square', 0.085, 0.11);
    if (combo >= 6) this.tone(b * 2.67, 0.11, 'square', 0.075, 0.17);
    if (combo >= 10) this.tone(b * 3.2, 0.12, 'square', 0.07, 0.23);
  },
  wrong() {
    this.tone(180, 0.16, 'sawtooth', 0.13);
    this.tone(138, 0.24, 'sawtooth', 0.11, 0.1);
  },
  timeout() {
    this.tone(300, 0.14, 'square', 0.11);
    this.tone(200, 0.3, 'square', 0.11, 0.13, 90);
  },
  tick() { this.tone(1500, 0.025, 'square', 0.04); },
  hint() { this.tone(1000, 0.05, 'triangle', 0.09); this.tone(1320, 0.06, 'triangle', 0.09, 0.05); },
  click() { this.tone(760, 0.035, 'square', 0.06); },
  move() { this.tone(1180, 0.03, 'square', 0.05); this.tone(1560, 0.03, 'square', 0.04, 0.03); },
  start() { [520, 660, 880].forEach((f, i) => this.tone(f, 0.09, 'square', 0.1, i * 0.07)); },
  over() { [392, 330, 262, 196].forEach((f, i) => this.tone(f, 0.22, 'square', 0.12, i * 0.15)); },
  best() { [660, 880, 1100, 1320, 1760].forEach((f, i) => this.tone(f, 0.1, 'square', 0.1, i * 0.085)); },

  /* ---- 逼近演出用 ---- */
  /* 准备 OK！ */
  ready() { [523, 659, 784, 1047].forEach((f, i) => this.tone(f, 0.1, 'square', 0.1, i * 0.09)); },
  /* 单词从远处飞过来（由低到高的风声） */
  enter() { this.tone(110, 0.3, 'sawtooth', 0.05, 0, 460); this.tone(220, 0.16, 'triangle', 0.035, 0.16, 700); },
  /* 印章砸下 */
  stamp() {
    this.tone(300, 0.08, 'square', 0.13);
    this.tone(150, 0.22, 'sawtooth', 0.11, 0.02, 70);
    this.tone(900, 0.05, 'square', 0.06, 0);
  },
  /* 撞到脸上（超时判定） */
  crash() {
    this.tone(420, 0.09, 'sawtooth', 0.14, 0, 120);
    this.tone(120, 0.42, 'sawtooth', 0.14, 0.06, 52);
    this.tone(70, 0.5, 'triangle', 0.11, 0.1, 40);
  },
  /* 贴脸撞击的一瞬：一记闷响 + 高频碎片声，比 crash 更短更"硬" */
  impact() {
    this.tone(240, 0.16, 'sawtooth', 0.16, 0, 60);
    this.tone(58, 0.62, 'triangle', 0.15, 0.02, 38);
    this.tone(1600, 0.05, 'square', 0.06, 0, 320);
  }
};
