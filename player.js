import { readSettings, patchSettings, sizes, clamp, editedTempo } from './shared.js';
import { MetronomeAudio } from './audio.js';
const ui = Object.fromEntries([...document.querySelectorAll('[id]')].map(el => [el.id, el]));
let settings = await readSettings();
let pip = null;
let opening = null;
let editing = false;
let taps = [];
let saveTimer;
let pendingPatch = {};
let audio;
function newAudio() {
  return new MetronomeAudio(accent => {
    ui.pulse.classList.toggle('accent', accent);
    ui.pulse.animate([{ transform: 'scale(1.65)', opacity: 1 }, { transform: 'scale(1)', opacity: 0.4 }], { duration: 180 });
  });
}
audio = newAudio();
function render() {
  if (!editing) ui.bpm.value = settings.bpm;
  ui['tempo-slider'].min = settings.min;
  ui['tempo-slider'].max = settings.max;
  ui['tempo-slider'].value = settings.bpm;
  ui.low.textContent = settings.min;
  ui.high.textContent = settings.max;
  ui.metronome.style.opacity = settings.opacity / 100;
  ui.toggle.textContent = audio.running ? 'Ⅱ Stop' : '▶ Start';
  ui.toggle.setAttribute('aria-pressed', String(audio.running));
  ui.pulse.classList.toggle('running', audio.running);
  ui.minus.disabled = settings.bpm <= settings.min;
  ui.plus.disabled = settings.bpm >= settings.max;
}
function save(patch) {
  Object.assign(pendingPatch, patch);
  clearTimeout(saveTimer);
  saveTimer = setTimeout(flush, 100);
}
function flush() {
  clearTimeout(saveTimer);
  saveTimer = null;
  const patch = pendingPatch;
  pendingPatch = {};
  if (Object.keys(patch).length) return patchSettings(patch).catch(showError);
}
function apply(patch) {
  Object.assign(settings, patch);
  audio.update(settings);
  render();
  save(patch);
}
function setBpm(bpm) { apply({ bpm: clamp(Math.round(bpm), settings.min, settings.max) }); }
function commitEdit() {
  if (!editing) return;
  editing = false;
  ui.bpm.readOnly = true;
  const patch = editedTempo(ui.bpm.value, settings);
  ui.bpm.blur();
  apply(patch);
}
ui.bpm.addEventListener('dblclick', event => {
  event.preventDefault();
  editing = true;
  ui.bpm.readOnly = false;
  ui.bpm.focus();
  ui.bpm.select();
});
// Pointerdown happens before the second click's dblclick event, so the opening
// double-click does not also commit. The very next click, even inside, commits.
function pointerdown(event) {
  if (!editing) return;
  const inside = event.target === ui.bpm;
  commitEdit();
  if (inside) event.preventDefault();
}
ui.bpm.addEventListener('blur', commitEdit);
function showError(error) { ui.error.textContent = error.message || String(error); }
async function toggle() {
  ui.error.textContent = '';
  if (audio.running) audio.stop();
  else {
    const promise = audio.start(settings);
    render();
    try { await promise; } catch (error) { showError(error); }
  }
  render();
}
function tap() {
  const now = performance.now();
  if (now - (taps.at(-1) || 0) > 3000) taps = [];
  taps.push(now);
  taps = taps.slice(-6);
  if (taps.length > 1) setBpm(60000 * (taps.length - 1) / (now - taps[0]));
}
function cleanup() {
  commitEdit();
  audio.destroy();
  audio = newAudio();
  taps = [];
  void flush();
  ui.dock.append(ui.metronome);
  pip = null;
  render();
}
function hide() {
  commitEdit();
  audio.stop();
  if (pip) pip.close();
  else cleanup();
}
function keyboard(event) {
  if (editing) {
    if (event.key === 'Enter') { event.preventDefault(); event.stopPropagation(); commitEdit(); }
    return;
  }
  if (event.altKey || event.ctrlKey || event.metaKey) return;
  const deltas = { ArrowUp: 1, ArrowDown: -1, ArrowRight: 5, ArrowLeft: -5 };
  if (event.code === 'Space') { event.preventDefault(); if (!event.repeat) void toggle(); }
  else if (deltas[event.key]) { event.preventDefault(); setBpm(settings.bpm + deltas[event.key]); }
  else if (event.key === 'Escape') { event.preventDefault(); hide(); }
  else if (event.key.toLowerCase() === 't' && !event.repeat) { event.preventDefault(); tap(); }
}
ui.toggle.addEventListener('click', toggle);
ui.minus.addEventListener('click', () => setBpm(settings.bpm - 1));
ui.plus.addEventListener('click', () => setBpm(settings.bpm + 1));
ui['tempo-slider'].addEventListener('input', event => setBpm(Number(event.target.value)));
ui.tap.addEventListener('click', tap);
ui.hide.addEventListener('click', hide);
async function show() {
  if (pip) { pip.focus(); return; }
  if (opening) return opening;
  const [width, height] = sizes[settings.size];
  // Call synchronously inside the extension message's user-gesture scope.
  const request = documentPictureInPicture.requestWindow({ width, height: height - 30, disallowReturnToOpener: true });
  opening = request.then(win => {
    pip = win;
    const link = pip.document.createElement('link');
    link.rel = 'stylesheet';
    link.href = chrome.runtime.getURL('style.css');
    pip.document.head.append(link);
    pip.document.title = 'Little Metronome';
    pip.document.body.className = 'player-body';
    pip.document.body.append(ui.metronome);
    pip.document.addEventListener('keydown', keyboard);
    pip.document.addEventListener('pointerdown', pointerdown, true);
    pip.addEventListener('blur', () => { commitEdit(); void flush(); });
    pip.addEventListener('pagehide', cleanup, { once: true });
    ui.toggle.focus();
  }).finally(() => { opening = null; });
  return opening;
}
chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (sender.id !== chrome.runtime.id) return;
  if (message.type === 'player-status') { respond({ visible: !!pip }); return; }
  if (message.type === 'hide') { hide(); respond({ visible: false }); return; }
  if (message.type === 'show') {
    show().then(() => respond({ visible: true }), error => respond({ error: error.message }));
    return true;
  }
});
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.settings) {
    settings = { ...changes.settings.newValue, ...pendingPatch };
    settings.bpm = clamp(settings.bpm, settings.min, settings.max);
    audio.update(settings);
    render();
  }
});
window.addEventListener('pagehide', () => { audio.destroy(); pip?.close(); });
render();
window.metronomeReady = true;
