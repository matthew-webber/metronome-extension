import { readSettings, patchSettings } from './shared.js';
const $ = id => document.getElementById(id);
const fields = ['min', 'max', 'subdivision', 'sound', 'volume', 'beats', 'showCount', 'size', 'opacity'];
let visible = false;
let ownerTabId;
function render(settings) {
  for (const key of fields) $(key).value = settings[key];
  $('subdivision').parentElement.dataset.subdivision = settings.subdivision;
  for (const key of ['volume', 'opacity']) $(`${key}-value`).textContent = `${settings[key]}%`;
}
function visibility(value) {
  visible = value;
  $('visibility').textContent = visible ? 'Hide & stop metronome' : 'Show metronome';
}
function error(e) { $('message').textContent = e.message; }
render(await readSettings());
async function prepare() {
  $('visibility').disabled = true;
  const result = await chrome.runtime.sendMessage({ type: 'prepare' });
  if (result.error) throw new Error(result.error);
  ownerTabId = result.ownerTabId;
  // Warm the owner before the user clicks, so Show retains Chrome's gesture.
  const deadline = Date.now() + 5000;
  while (!chrome.extension.getViews({ tabId: result.ownerTabId }).some(view => view.metronomeReady)) {
    if (Date.now() > deadline) throw new Error('Please reopen the settings popup.');
    await new Promise(resolve => setTimeout(resolve, 25));
  }
  const state = await chrome.runtime.sendMessage({ type: 'player-status' });
  visibility(state.visible);
  $('visibility').disabled = false;
}
try { await prepare(); } catch (e) { error(e); }
$('visibility').addEventListener('click', async () => {
  $('visibility').disabled = true;
  try {
    const result = await chrome.runtime.sendMessage({ type: visible ? 'hide' : 'show' });
    if (result.error) throw new Error(result.error);
    visibility(result.visible);
  } catch (e) { error(e); }
  finally { $('visibility').disabled = false; }
});
$('settings').addEventListener('submit', e => e.preventDefault());
$('settings').addEventListener('input', e => {
  if (['volume', 'opacity'].includes(e.target.id)) $(`${e.target.id}-value`).textContent = `${e.target.value}%`;
});
$('settings').addEventListener('change', async e => {
  const key = e.target.id;
  if (key === 'subdivision') e.target.parentElement.dataset.subdivision = e.target.value;
  if (!fields.includes(key)) return;
  const min = Number($('min').value), max = Number($('max').value);
  if (!$('settings').checkValidity() || min >= max) {
    $('message').textContent = 'Use whole BPM values from 20–400, with minimum below maximum.';
    return;
  }
  try {
    const patch = ['min', 'max'].includes(key) ? { min, max } : { [key]: e.target.value };
    await patchSettings(patch);
    $('message').textContent = 'Saved.';
  } catch (e) { error(e); }
});
chrome.windows.onRemoved.addListener(async () => {
  try {
    const result = await chrome.runtime.sendMessage({ type: 'player-status' });
    visibility(result.visible);
  } catch {}
});
chrome.tabs.onRemoved.addListener(id => { if (id === ownerTabId) void prepare().catch(error); });
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.settings) {
    const settings = changes.settings.newValue;
    for (const key of fields) {
      if (document.activeElement !== $(key) || key === 'subdivision') $(key).value = settings[key];
      if (key === 'subdivision') $(key).parentElement.dataset.subdivision = settings[key];
    }
  }
});
