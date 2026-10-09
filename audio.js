import { subdivisions } from './shared.js';
// Synthesized locally with Web Audio. No recordings, downloads, or network.
// [type, frequency, duration, partial]. Each sound has its own downbeat voice;
// the optional partial adds a quieter overtone at that frequency ratio.
const voices = {
  wood: { beat: ['triangle', 950, 0.045], accent: ['triangle', 1480, 0.07, 2.76] },
  tick: { beat: ['square', 1700, 0.018], accent: ['sine', 2100, 0.1, 2] },
  soft: { beat: ['sine', 650, 0.075], accent: ['sine', 880, 0.18, 1.5] },
};
const offbeatVoice = ['sine', 2400, 0.012];
export class MetronomeAudio {
  constructor(onBeat) {
    this.onBeat = onBeat;
    this.running = false;
    this.sources = new Set();
    this.flashes = new Set();
    this.generation = 0;
  }
  async start(settings) {
    if (this.running) return;
    this.running = true;
    const generation = ++this.generation;
    this.context ??= new AudioContext({ latencyHint: 'interactive' });
    try { await this.context.resume(); } catch (e) { this.stop(); throw e; }
    if (!this.running || generation !== this.generation) return;
    this.settings = settings;
    this.beat = 0;
    this.sub = 0;
    this.next = this.context.currentTime + 0.025;
    this.schedule();
    this.timer = setInterval(() => this.schedule(), 25);
  }
  update(settings) { this.settings = settings; }
  schedule() {
    const now = this.context.currentTime;
    // After sleep or a heavily stalled renderer, resume without a burst of old beats.
    if (this.next < now) { this.next = now + 0.01; this.sub = 0; }
    while (this.next < now + 0.12) {
      // Snapshot each beat so live changes cannot duplicate or shift its notes.
      if (this.sub === 0) {
        this.offsets = subdivisions[this.settings.subdivision] || subdivisions.quarter;
        this.beatStart = this.next;
        this.beatDuration = 60 / this.settings.bpm;
        // A shorter bar restarts on its downbeat; a longer one keeps counting.
        this.bar = this.settings.beats;
        if (this.beat >= this.bar) this.beat = 0;
      }
      const offbeat = this.sub !== 0;
      const accent = !offbeat && this.bar > 0 && this.beat === 0;
      this.click(this.next, accent, offbeat);
      if (!offbeat) {
        const beat = this.beat;
        const id = setTimeout(() => {
          this.flashes.delete(id);
          if (this.running) this.onBeat(accent, beat);
        }, Math.max(0, (this.next - this.context.currentTime) * 1000));
        this.flashes.add(id);
      }
      this.sub++;
      if (this.sub === this.offsets.length) {
        this.sub = 0;
        this.beat++;
        this.next = this.beatStart + this.beatDuration;
      } else this.next = this.beatStart + this.offsets[this.sub] * this.beatDuration;
    }
  }
  click(time, accent, offbeat = false) {
    const voice = voices[this.settings.sound] || voices.wood;
    const [type, frequency, duration, partial] = offbeat ? offbeatVoice : accent ? voice.accent : voice.beat;
    const level = this.settings.volume / 100 * (offbeat ? 0.20 : accent ? 0.65 : 0.42);
    // Accents hold their pitch so they ring rather than knock.
    this.tone(time, type, frequency, duration, level, accent ? 0.9 : 0.55);
    if (partial) this.tone(time, 'sine', frequency * partial, duration * 0.6, level * 0.35, 0.9);
  }
  tone(time, type, frequency, duration, level, drop) {
    const ctx = this.context;
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, time);
    oscillator.frequency.exponentialRampToValueAtTime(frequency * drop, time + duration);
    gain.gain.setValueAtTime(0, time);
    gain.gain.linearRampToValueAtTime(level, time + 0.001);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + duration);
    oscillator.connect(gain).connect(ctx.destination);
    this.sources.add(oscillator);
    oscillator.onended = () => { this.sources.delete(oscillator); oscillator.disconnect(); gain.disconnect(); };
    oscillator.start(time);
    oscillator.stop(time + duration + 0.01);
  }
  stop() {
    this.running = false;
    this.generation++;
    clearInterval(this.timer);
    for (const id of this.flashes) clearTimeout(id);
    this.flashes.clear();
    for (const source of this.sources) { try { source.stop(); } catch {} }
    this.sources.clear();
  }
  destroy() { this.stop(); if (this.context && this.context.state !== 'closed') void this.context.close(); }
}
