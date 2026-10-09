export const subdivisions = { quarter: [0], eighth: [0, 0.5], sixteenth: [0, 0.25, 0.5, 0.75], swing: [0, 2 / 3] };
export const defaults = { bpm: 100, min: 50, max: 200, sound: 'wood', volume: 65, opacity: 100, size: 'small', beats: 4, subdivision: 'quarter', showCount: true };
export const sizes = { small: [320, 370], medium: [380, 420], large: [450, 480] };
export const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
export function normalize(value = {}) {
  const s = { ...defaults, ...value };
  for (const k of ['bpm', 'min', 'max', 'volume', 'opacity', 'beats']) {
    s[k] = Number.isFinite(Number(s[k])) ? Math.round(Number(s[k])) : defaults[k];
  }
  s.min = clamp(s.min, 20, 399);
  s.max = clamp(s.max, s.min + 1, 400);
  s.bpm = clamp(s.bpm, s.min, s.max);
  s.volume = clamp(s.volume, 0, 100);
  s.opacity = clamp(s.opacity, 30, 100);
  // Beats per bar: 0 (no accent) or 2–12.
  s.beats = s.beats < 2 ? 0 : Math.min(s.beats, 12);
  s.showCount = s.showCount !== false && s.showCount !== 'false';
  if (!['wood', 'tick', 'soft'].includes(s.sound)) s.sound = defaults.sound;
  if (!Object.hasOwn(subdivisions, s.subdivision)) s.subdivision = defaults.subdivision;
  if (!sizes[s.size]) s.size = defaults.size;
  return s;
}
export async function readSettings() {
  return normalize((await chrome.storage.local.get('settings')).settings);
}
export async function patchSettings(patch) {
  const result = await chrome.runtime.sendMessage({ type: 'settings', patch });
  if (result?.error) throw new Error(result.error);
  return result;
}

// Invalid direct edits always reset to 120; keep the slider's range consistent.
export function editedTempo(text, settings) {
  const value = Number(text.trim());
  const valid = /^\d+$/.test(text.trim()) && Number.isSafeInteger(value) && value >= settings.min && value <= settings.max;
  if (valid) return { bpm: value };
  return { bpm: 120, ...(settings.min > 120 ? { min: 120 } : {}), ...(settings.max < 120 ? { max: 120 } : {}) };
}
