import { subdivisions } from './shared.js';
// Synthesized locally with Web Audio. No recordings, downloads, or network.
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
      }
      const offbeat = this.sub !== 0;
      const accent = !offbeat && this.settings.beats > 0 && this.beat % this.settings.beats === 0;
      this.click(this.next, accent, offbeat);
      if (!offbeat) {
        const id = setTimeout(() => {
          this.flashes.delete(id);
          if (this.running) this.onBeat(accent);
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
    const ctx = this.context;
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    const voices = { wood: ['triangle', 950, 0.045], tick: ['square', 1700, 0.018], soft: ['sine', 650, 0.075] };
    const [type, frequency, duration] = offbeat ? ['sine', 2400, 0.012] : voices[this.settings.sound];
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency * (accent ? 1.5 : 1), time);
    oscillator.frequency.exponentialRampToValueAtTime(frequency * 0.55, time + duration);
    const level = this.settings.volume / 100 * (offbeat ? 0.20 : accent ? 0.65 : 0.42);
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
