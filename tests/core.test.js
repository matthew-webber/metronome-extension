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
  const pending = audio.start(normalize({ bpm: 120, beats: 0 }));
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

test('subdivisions keep quarter-note tempo and bar accents, including 2:1 swing', async () => {
  for (const [subdivision, offsets] of Object.entries({ quarter: [0], eighth: [0, .5], sixteenth: [0, .25, .5, .75], swing: [0, 2/3] })) {
    const events = [];
    const audio = new MetronomeAudio(() => {});
    audio.click = (time, accent, offbeat) => events.push({ time, accent, offbeat });
    const pending = audio.start(normalize({ bpm: 120, beats: 2, subdivision })); resume(); await pending;
    try {
      for (let t = .01; t < 1.1; t += .01) { audio.context.currentTime = t; audio.schedule(); }
      const expected = [0, 1].flatMap(beat => offsets.map(offset => .025 + (beat + offset) * .5));
      expected.forEach((time, i) => assert.ok(Math.abs(events[i].time - time) < 1e-9, subdivision));
      assert.ok(events.filter(e => e.offbeat).every(e => !e.accent));
      assert.deepEqual(events.filter(e => !e.offbeat).map(e => e.accent), [true, false, true]);
    } finally { audio.stop(); }
  }
});
test('live subdivision changes finish the current beat and stop cancels added notes', async () => {
  const audio = new MetronomeAudio(() => {});
  const pending = audio.start(normalize({ bpm: 120, beats: 0, subdivision: 'sixteenth' })); resume(); await pending;
  audio.update(normalize({ bpm: 120, beats: 0, subdivision: 'swing' }));
  for (let t = .01; t < .95; t += .01) { audio.context.currentTime = t; audio.schedule(); }
  const times = audio.context.sources.map(s => s.started);
  [.025, .15, .275, .4, .525, .525 + 1/3, 1.025].forEach((t, i) => assert.ok(Math.abs(times[i] - t) < 1e-9));
  assert.equal(audio.context.sources[1].type, 'sine');
  audio.stop();
  assert.ok(audio.context.sources.every(s => s.stopped === 'immediate'));
  assert.equal(normalize({ subdivision: 'invalid' }).subdivision, 'quarter');
});
test('beats per bar accept off or 2–12, and the count can be hidden', () => {
  assert.deepEqual([0, 1, 2, 12, 13, -4, '7'].map(beats => normalize({ beats }).beats), [0, 0, 2, 12, 12, 0, 7]);
  assert.equal(normalize().showCount, true);
  assert.equal(normalize({ showCount: 'false' }).showCount, false);
  assert.equal(normalize({ showCount: false }).showCount, false);
});
test('each sound has a distinct downbeat voice', async () => {
  for (const sound of ['wood', 'tick', 'soft']) {
    const audio = new MetronomeAudio(() => {});
    const pending = audio.start(normalize({ bpm: 120, beats: 3, sound })); resume(); await pending;
    try {
      for (let t = .01; t < .6; t += .01) { audio.context.currentTime = t; audio.schedule(); }
      const [accent, overtone, beat] = audio.context.sources;
      assert.equal(overtone.started, accent.started, `${sound} accent has an overtone`);
      assert.ok(beat.started > accent.started, `${sound} plain beat is a single tone`);
      assert.equal(audio.context.sources.filter(s => s.started === beat.started).length, 1);
    } finally { audio.stop(); }
  }
});
test('bar position reports each beat and restarts when the bar shrinks', async () => {
  const events = [];
  const audio = new MetronomeAudio(() => {});
  audio.click = (time, accent, offbeat) => { if (!offbeat) events.push([audio.beat, accent]); };
  const pending = audio.start(normalize({ bpm: 120, beats: 6 })); resume(); await pending;
  try {
    for (let t = .01; t < 1.9; t += .01) { audio.context.currentTime = t; audio.schedule(); }
    audio.update(normalize({ bpm: 120, beats: 3 }));
    for (let t = 1.9; t < 3.5; t += .01) { audio.context.currentTime = t; audio.schedule(); }
    assert.deepEqual(events.map(([beat]) => beat), [0, 1, 2, 3, 0, 1, 2, 0]);
    assert.deepEqual(events.map(([, accent]) => accent), [true, false, false, false, true, false, false, true]);
  } finally { audio.stop(); }
});
