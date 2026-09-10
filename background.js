import { readSettings, normalize } from './shared.js';
let queue = Promise.resolve();
async function prepare() {
  const { ownerTabId } = await chrome.storage.session.get('ownerTabId');
  if (ownerTabId !== undefined) {
    try { await chrome.tabs.get(ownerTabId); return { ownerTabId }; } catch {}
  }
  const tab = await chrome.tabs.create({ url: chrome.runtime.getURL('player.html'), active: false, pinned: true });
  await chrome.storage.session.set({ ownerTabId: tab.id });
  return { ownerTabId: tab.id };
}
async function handle(message) {
  if (message.type === 'prepare') return prepare();
  const settings = normalize({ ...await readSettings(), ...message.patch });
  await chrome.storage.local.set({ settings });
  return settings;
}
chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (sender.id !== chrome.runtime.id || !['settings', 'prepare'].includes(message.type)) return;
  queue = queue.then(() => handle(message));
  queue.then(respond, error => respond({ error: error.message }));
  queue = queue.catch(() => {});
  return true;
});
