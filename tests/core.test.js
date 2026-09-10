import test from 'node:test';
import assert from 'node:assert/strict';
import { normalize, editedTempo } from '../shared.js';
import { MetronomeAudio } from '../audio.js';

test('tempo stays inside validated custom bounds', () => {
  assert.equal(normalize({ min: 90, max: 120, bpm: 200 }).bpm, 120);
  assert.equal(normalize({ min: 90, max: 120, bpm: 40 }).bpm, 90);
  const s = normalize({ min: 999, max: -5, bpm: Infinity, volume: 999, opacity: 0, sound: 'missing' });
  assert.deepEqual([s.min, s.max, s.bpm, s.volume, s.opacity, s.sound], [399, 400, 399, 100, 30, 'wood']);
});

let resume;
class FakeContext {
  currentTime = 0;
  destination = {};
  state = 'running';
  sources = [];
  resume() { return new Promise(resolve => { resume = resolve; }); }
  close() { this.state = 'closed'; return Promise.resolve(); }
  createOscillator() {
    const node = { frequency: { setValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect() { return this; }, disconnect() {}, start(t) { this.started = t; }, stop(t) { this.stopped = t ?? 'immediate'; } };
    this.sources.push(node);
    return node;
  }
  createGain() { return { gain: { setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect() { return this; }, disconnect() {} }; }
}
globalThis.AudioContext = FakeContext;
test('stop during pending audio resume never starts a timer or sound', async () => {
  const audio = new MetronomeAudio(() => {});
  const pending = audio.start(normalize());
  audio.stop();
  resume();
  await pending;
  assert.equal(audio.running, false);
  assert.equal(audio.timer, undefined);
  assert.equal(audio.context.sources.length, 0);
});
test('audio-clock timing, stalled scheduling, and cancellation', async () => {
  const audio = new MetronomeAudio(() => {});
  const pending = audio.start(normalize({ bpm: 120 }));
  resume();
  await pending;
  assert.equal(audio.context.sources[0].started, .025);
  audio.context.currentTime = .45;
  audio.schedule();
  assert.equal(audio.context.sources[1].started, .525);
  audio.context.currentTime = 100;
  audio.schedule();
  assert.equal(audio.context.sources.length, 3, 'one recovery beat, no backlog burst');
  audio.stop();
  assert.ok(audio.context.sources.every(s => s.stopped === 'immediate'));
  assert.equal(audio.flashes.size, 0);
  audio.destroy();
  assert.equal(audio.context.state, 'closed');
});

test('direct tempo edits reset invalid input to 120, with consistent bounds', () => {
  const settings = normalize();
  assert.deepEqual(editedTempo('137', settings), { bpm: 137 });
  for (const value of ['', ' ', 'abc', '-1', '49', '201', '120.5', '1e2', 'Infinity']) {
    assert.deepEqual(editedTempo(value, settings), { bpm: 120 });
  }
  assert.deepEqual(editedTempo('149', { min: 150, max: 200 }), { bpm: 120, min: 120 });
  assert.deepEqual(editedTempo('101', { min: 50, max: 100 }), { bpm: 120, max: 120 });
});
