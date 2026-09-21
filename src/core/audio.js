// core/audio.js — fully procedural WebAudio soundtrack & SFX for THE LONG QUIET.
// Music identity: the Resonance is sound — so every region theme is built from
// bell partials, pads, low percussion and choir-like textures. No audio files.
//
// Region music config lives in data/world.js (region.music).
export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.settings = { master: .8, music: .7, sfx: .9 };
    this.musicRegion = null;
    this.bossMode = false;
    this.intensity = 0;      // 0..1, raised by boss phases
    this._timer = null;
    this._nextBar = 0;
    this._barIndex = 0;
    this._melodyDeg = 0;
    this._noiseBuf = null;
  }

  unlock() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    const c = this.ctx;
    this.master = c.createGain();
    this.comp = c.createDynamicsCompressor();
    this.comp.threshold.value = -18; this.comp.ratio.value = 4;
    this.master.connect(this.comp); this.comp.connect(c.destination);
    this.musicBus = c.createGain(); this.sfxBus = c.createGain(); this.ambBus = c.createGain();
    this.musicBus.connect(this.master); this.sfxBus.connect(this.master); this.ambBus.connect(this.master);
    // shared echoing "cavern" delay for bells
    this.delay = c.createDelay(1.2); this.delay.delayTime.value = 0.42;
    this.delayFb = c.createGain(); this.delayFb.gain.value = 0.34;
    this.delayWet = c.createGain(); this.delayWet.gain.value = 0.5;
    this.delay.connect(this.delayFb); this.delayFb.connect(this.delay);
    this.delay.connect(this.delayWet); this.delayWet.connect(this.master);
    this._applyVolumes();
    this._makeNoise();
    this._startScheduler();
  }

  setSettings(s) {
    this.settings.master = s.master; this.settings.music = s.music; this.settings.sfx = s.sfx;
    this._applyVolumes();
  }
  _applyVolumes() {
    if (!this.ctx) return;
    this.master.gain.value = this.settings.master;
    this.musicBus.gain.value = this.settings.music * 0.9;
    this.sfxBus.gain.value = this.settings.sfx;
    this.ambBus.gain.value = this.settings.music * 0.8;
  }

  _makeNoise() {
    const c = this.ctx, len = c.sampleRate * 2;
    this._noiseBuf = c.createBuffer(1, len, c.sampleRate);
    const d = this._noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  }
  _noise() { const s = this.ctx.createBufferSource(); s.buffer = this._noiseBuf; s.loop = true; return s; }

  // ------------------------------------------------------------- voices
  _freq(root, semis) { return root * Math.pow(2, semis / 12); }

  bell(freq, dur = 2.2, vol = 0.2, dest) {
    if (!this.ctx) return;
    const c = this.ctx, t = c.currentTime;
    const partials = [[1, 1], [2.76, .45], [5.4, .18], [8.9, .07]];
    for (const [ratio, amp] of partials) {
      const o = c.createOscillator(); o.type = 'sine';
      o.frequency.value = freq * ratio;
      const g = c.createGain();
      const a = vol * amp;
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(a, t + 0.008);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur / (1 + ratio * 0.35));
      o.connect(g); g.connect(dest || this.musicBus);
      g.connect(this.delay); // send to cavern echo
      o.start(t); o.stop(t + dur + .1);
    }
  }

  pad(freq, dur = 6, vol = 0.06, bright = 900) {
    if (!this.ctx) return;
    const c = this.ctx, t = c.currentTime;
    const g = c.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + dur * .35);
    g.gain.linearRampToValueAtTime(0.0001, t + dur);
    const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = bright;
    g.connect(f); f.connect(this.musicBus);
    for (const det of [-4, 3]) {
      const o = c.createOscillator(); o.type = 'triangle';
      o.frequency.value = freq; o.detune.value = det;
      o.connect(g); o.start(t); o.stop(t + dur + .1);
    }
  }

  bass(freq, dur = 2.4, vol = 0.12) {
    if (!this.ctx) return;
    const c = this.ctx, t = c.currentTime;
    const o = c.createOscillator(); o.type = 'sine'; o.frequency.value = freq / 2;
    const o2 = c.createOscillator(); o2.type = 'sawtooth'; o2.frequency.value = freq / 2;
    const g = c.createGain(); const g2 = c.createGain(); g2.gain.value = .12;
    const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 260;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + .12);
    g.gain.exponentialRampToValueAtTime(.0001, t + dur);
    o.connect(g); o2.connect(g2); g2.connect(f); f.connect(g); g.connect(this.musicBus);
    o.start(t); o.stop(t + dur + .1); o2.start(t); o2.stop(t + dur + .1);
  }

  choir(freq, dur = 5, vol = 0.045) {
    if (!this.ctx) return;
    const c = this.ctx, t = c.currentTime;
    const g = c.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + dur * .45);
    g.gain.linearRampToValueAtTime(.0001, t + dur);
    // two formant bandpasses -> vowel-ish "ah"
    for (const [fq, q] of [[520, 8], [900, 10]]) {
      const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = fq; f.Q.value = q;
      const o = c.createOscillator(); o.type = 'sawtooth'; o.frequency.value = freq; o.detune.value = (Math.random() * 8 - 4);
      o.connect(f); f.connect(g); o.start(t); o.stop(t + dur + .1);
    }
    g.connect(this.musicBus);
  }

  perc(kind = 'thump', vol = 0.2) {
    if (!this.ctx) return;
    const c = this.ctx, t = c.currentTime;
    if (kind === 'thump') {
      const o = c.createOscillator(); o.type = 'sine';
      o.frequency.setValueAtTime(90, t); o.frequency.exponentialRampToValueAtTime(34, t + .18);
      const g = c.createGain();
      g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(.0001, t + .25);
      o.connect(g); g.connect(this.musicBus); o.start(t); o.stop(t + .3);
    } else { // tick / shaker
      const s = this._noise();
      const f = c.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = kind === 'tick' ? 5200 : 1600;
      const g = c.createGain();
      g.gain.setValueAtTime(vol * .5, t); g.gain.exponentialRampToValueAtTime(.0001, t + (kind === 'tick' ? .05 : .16));
      s.connect(f); f.connect(g); g.connect(this.musicBus); s.start(t); s.stop(t + .2);
    }
  }

  // ------------------------------------------------------------- music scheduler
  setRegion(regionId, music) {
    if (this.musicRegion === regionId && !this.bossMode) return;
    this.musicRegion = regionId;
    this.music = music || this.music || { root: 220, scale: [0, 3, 5, 7, 10], tempo: 60, chords: [0, 5, 3, 4], pad: true, bells: true, bass: true, choir: false, perc: false, density: .8 };
    this._barIndex = 0;
  }

  setBoss(on, intensity = 0) {
    this.bossMode = on; this.intensity = intensity;
    if (on) this._barIndex = 0;
  }

  _startScheduler() {
    if (this._timer) return;
    this._timer = setInterval(() => this._schedule(), 90);
  }

  _schedule() {
    if (!this.ctx || !this.music || this.ctx.state !== 'running') return;
    const beat = 60 / (this.music.tempo * (this.bossMode ? 1.35 : 1));
    const barLen = beat * 4;
    const now = this.ctx.currentTime;
    if (this._nextBar < now) this._nextBar = now + 0.08;
    while (this._nextBar < now + 0.6) {
      this._playBar(this._nextBar, barLen, beat);
      this._nextBar += barLen;
      this._barIndex++;
    }
  }

  _playBar(t0, barLen, beat) {
    const m = this.music;
    const chordDeg = m.chords[this._barIndex % m.chords.length];
    const root = m.root;
    const dens = (m.density || 1) * (this.bossMode ? 1.2 : 1);

    // sustained chord pad + choir
    if (m.pad) for (const iv of [0, m.scale[Math.min(chordDeg + 2, m.scale.length - 1)], 7]) {
      const f = this._freq(root, m.scale[chordDeg % m.scale.length] + iv - 12);
      this.pad(f, barLen * 1.1, 0.05 + this.intensity * 0.03, 700 + this.intensity * 900);
    }
    if (m.choir && (this._barIndex % 2 === 0 || this.bossMode)) {
      const f = this._freq(root, m.scale[chordDeg % m.scale.length]);
      this.choir(f / 2, barLen * 1.6, 0.035 + this.intensity * 0.03);
    }
    // bass
    if (m.bass) this.bass(this._freq(root, m.scale[chordDeg % m.scale.length] - 24), barLen * .9, .11);
    // percussion
    if (m.perc || this.bossMode) {
      this.perc('thump', .22 + this.intensity * .12);
      if (this.bossMode || this.intensity > .3) {
        setTimeout(() => this.perc('thump', .12 + this.intensity * .1), beat * 2000);
        this.perc('tick', .10 + this.intensity * .08);
        setTimeout(() => this.perc('tick', .08), beat * 1.5 * 1000);
      }
    }
    // melody bells: random walk on scale, denser with intensity
    const notes = (this.bossMode ? 4 : 2) + Math.round(this.intensity * 2);
    for (let i = 0; i < notes; i++) {
      if (Math.random() > .82 - this.intensity * .3) continue;
      const step = Math.round((Math.random() * 4 - 2));
      this._melodyDeg = Math.max(-2, Math.min(9, this._melodyDeg + step));
      const deg = this._melodyDeg;
      const oct = Math.floor(deg / m.scale.length);
      const semi = m.scale[((deg % m.scale.length) + m.scale.length) % m.scale.length] + 12 * oct;
      const when = (t0 - this.ctx.currentTime) + i * beat * (Math.random() < .3 ? 1.5 : 1) * 1000;
      setTimeout(() => this.bell(this._freq(root, semi + 12), 2.6, .14 + this.intensity * .08), Math.max(0, when));
    }
  }

  // ------------------------------------------------------------- ambience
  setAmbience(kind) {
    if (this._ambKind === kind) return;
    this._stopAmbience();
    this._ambKind = kind;
    if (!this.ctx || !kind) return;
    const c = this.ctx;
    if (kind.wind || kind.rumble || kind.machine) {
      const s = this._noise();
      const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = kind.wind ? 420 : 120;
      const g = c.createGain(); g.gain.value = (kind.wind ? .05 : .06);
      // slow LFO on gain
      const lfo = c.createOscillator(); lfo.frequency.value = .07;
      const lg = c.createGain(); lg.gain.value = g.gain.value * .6;
      lfo.connect(lg); lg.connect(g.gain); lfo.start();
      s.connect(f); f.connect(g); g.connect(this.ambBus);
      s.start(); this._ambNodes = [s, lfo];
    }
    if (kind.machine) {
      const o = c.createOscillator(); o.type = 'sawtooth'; o.frequency.value = 46;
      const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 90;
      const g = c.createGain(); g.gain.value = .05;
      const lfo = c.createOscillator(); lfo.frequency.value = .5;
      const lg = c.createGain(); lg.gain.value = .025;
      lfo.connect(lg); lg.connect(g.gain); lfo.start();
      o.connect(f); f.connect(g); g.connect(this.ambBus);
      o.start(); this._ambNodes.push(o, lfo);
    }
    if (kind.drips) {
      this._dripTimer = setInterval(() => {
        if (Math.random() < .4) this.bell(1400 + Math.random() * 2200, .5, .035, this.ambBus);
      }, 1500);
    }
    if (kind.insects) {
      this._dripTimer = setInterval(() => {
        if (Math.random() < .5) {
          const c = this.ctx, t = c.currentTime;
          const o = c.createOscillator(); o.type = 'sine'; o.frequency.value = 3200 + Math.random() * 2500;
          const g = c.createGain(); g.gain.setValueAtTime(.012, t); g.gain.exponentialRampToValueAtTime(.0001, t + .12);
          o.connect(g); g.connect(this.ambBus); o.start(t); o.stop(t + .14);
        }
      }, 900);
    }
  }
  _stopAmbience() {
    if (this._dripTimer) { clearInterval(this._dripTimer); this._dripTimer = null; }
    if (this._ambNodes) { for (const n of this._ambNodes) { try { n.stop(); } catch {} } this._ambNodes = null; }
    this._ambKind = null;
  }

  // ------------------------------------------------------------- SFX
  _env(vol, a = .004, d = .15) {
    const c = this.ctx, t = c.currentTime;
    const g = c.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + a);
    g.gain.exponentialRampToValueAtTime(.0001, t + a + d);
    return g;
  }

  sfx(name, opt = {}) {
    if (!this.ctx || this.ctx.state !== 'running') return;
    const c = this.ctx, t = c.currentTime;
    const out = this.sfxBus;
    const v = opt.vol || 1;
    switch (name) {
      case 'swing': {
        const s = this._noise(); const f = c.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 1.2;
        f.frequency.setValueAtTime(900, t); f.frequency.exponentialRampToValueAtTime(2600, t + .09);
        const g = this._env(.16 * v, .005, .09);
        s.connect(f); f.connect(g); g.connect(out); s.start(t); s.stop(t + .15);
        this.bell(1800 + Math.random() * 400, .35, .05 * v, out);
        break;
      }
      case 'hit': {
        const o = c.createOscillator(); o.type = 'square';
        o.frequency.setValueAtTime(220, t); o.frequency.exponentialRampToValueAtTime(60, t + .08);
        const g = this._env(.2 * v, .003, .1);
        o.connect(g); g.connect(out); o.start(t); o.stop(t + .14);
        const s = this._noise(); const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 1800;
        const g2 = this._env(.18 * v, .002, .07);
        s.connect(f); f.connect(g2); g2.connect(out); s.start(t); s.stop(t + .1);
        break;
      }
      case 'clang': {
        this.bell(720, .6, .2 * v, out); this.bell(1810, .3, .1 * v, out);
        break;
      }
      case 'hurt': {
        const o = c.createOscillator(); o.type = 'triangle';
        o.frequency.setValueAtTime(340, t); o.frequency.exponentialRampToValueAtTime(90, t + .22);
        const g = this._env(.3 * v, .003, .25);
        o.connect(g); g.connect(out); o.start(t); o.stop(t + .3);
        this.bell(196, .9, .16 * v, out);
        break;
      }
      case 'jump': {
        const o = c.createOscillator(); o.type = 'sine';
        o.frequency.setValueAtTime(300, t); o.frequency.exponentialRampToValueAtTime(560, t + .1);
        const g = this._env(.06 * v, .004, .1);
        o.connect(g); g.connect(out); o.start(t); o.stop(t + .13);
        break;
      }
      case 'land': {
        const s = this._noise(); const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 500;
        const g = this._env(.12 * v, .003, .08);
        s.connect(f); f.connect(g); g.connect(out); s.start(t); s.stop(t + .1);
        break;
      }
      case 'dash': {
        const s = this._noise(); const f = c.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = .8;
        f.frequency.setValueAtTime(400, t); f.frequency.exponentialRampToValueAtTime(3200, t + .16);
        const g = this._env(.2 * v, .004, .16);
        s.connect(f); f.connect(g); g.connect(out); s.start(t); s.stop(t + .2);
        break;
      }
      case 'heal': {
        for (let i = 0; i < 3; i++) setTimeout(() => this.bell(660 * Math.pow(2, i / 12 * 2), 1.4, .1 * v, out), i * 130);
        break;
      }
      case 'pickup': {
        this.bell(1046, .8, .14 * v, out); setTimeout(() => this.bell(1568, 1.1, .12 * v, out), 90);
        break;
      }
      case 'ability': {
        [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => this.bell(f, 1.6, .13 * v, out), i * 120));
        break;
      }
      case 'checkpoint': {
        this.bell(220, 3.2, .22 * v, out); this.bell(110, 3.6, .18 * v, out);
        setTimeout(() => this.bell(440, 2.4, .12 * v, out), 300);
        break;
      }
      case 'toll': { // big ominous bell
        this.bell(98, 5, .3 * v, out); this.bell(98 * 2.76, 3, .12 * v, out);
        break;
      }
      case 'sonde': {
        const o = c.createOscillator(); o.type = 'sine';
        o.frequency.setValueAtTime(880, t); o.frequency.exponentialRampToValueAtTime(1320, t + .12);
        const g = this._env(.12 * v, .004, .16);
        o.connect(g); g.connect(out); o.start(t); o.stop(t + .2);
        break;
      }
      case 'break': {
        const s = this._noise(); const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 900;
        const g = this._env(.3 * v, .003, .3);
        s.connect(f); f.connect(g); g.connect(out); s.start(t); s.stop(t + .35);
        break;
      }
      case 'die': {
        const base = opt.pitch || 300;
        const o = c.createOscillator(); o.type = 'sawtooth';
        o.frequency.setValueAtTime(base, t); o.frequency.exponentialRampToValueAtTime(base * .3, t + .25);
        const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 900;
        const g = this._env(.14 * v, .004, .28);
        o.connect(f); f.connect(g); g.connect(out); o.start(t); o.stop(t + .32);
        break;
      }
      case 'roar': {
        const o = c.createOscillator(); o.type = 'sawtooth'; o.frequency.setValueAtTime(70, t);
        o.frequency.linearRampToValueAtTime(120, t + .3); o.frequency.linearRampToValueAtTime(55, t + .9);
        const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 300;
        const g = this._env(.34 * v, .05, 1.0);
        o.connect(f); f.connect(g); g.connect(out); o.start(t); o.stop(t + 1.1);
        break;
      }
      case 'ui': this.bell(880, .3, .07 * v, out); break;
      case 'blip': {
        const o = c.createOscillator(); o.type = 'sine'; o.frequency.value = opt.freq || 700;
        const g = this._env(.03 * v, .002, .04);
        o.connect(g); g.connect(out); o.start(t); o.stop(t + .06);
        break;
      }
      case 'secret': {
        [392, 523, 659, 880, 1046].forEach((f, i) => setTimeout(() => this.bell(f, 2, .1 * v, out), i * 90));
        break;
      }
      case 'phase': {
        const o = c.createOscillator(); o.type = 'sine';
        o.frequency.setValueAtTime(1600, t); o.frequency.exponentialRampToValueAtTime(300, t + .5);
        const g = this._env(.1 * v, .01, .5);
        o.connect(g); g.connect(out); o.start(t); o.stop(t + .55);
        break;
      }
      case 'pogo': { this.bell(1318, .5, .1 * v, out); break; }
      case 'warn': {
        const o = c.createOscillator(); o.type = 'square'; o.frequency.value = 160;
        const g = this._env(.08 * v, .005, .2);
        o.connect(g); g.connect(out); o.start(t); o.stop(t + .22);
        break;
      }
    }
  }
}
