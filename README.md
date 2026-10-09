# Little Metronome

A dependency-free Chrome extension. No build step, accounts, network requests, or downloaded audio. Only the `storage` permission is requested.

## Install

1. Open `chrome://extensions` in desktop Chrome 124 or newer.
2. Enable **Developer mode** (top right).
3. Choose **Load unpacked**, then select `/Users/m/dev/metronome-extension`.
4. Pin Little Metronome from Chrome's extensions menu. Click its icon, then **Show metronome**.

Start is always manual; reopening never resumes audio automatically.

## Use

**Show metronome** opens the always-on-top floating window directly. Drag its title bar to move it; resize its edges normally. There is no ordinary-window mode or float toggle. A pinned background tab keeps it alive (Chrome requires an owner page). Leave that tab open; it has no metronome controls. Hiding or closing the floating window stops playback and releases its audio context. Reopening stays stopped.

Double-click the large BPM number to edit it. Enter, clicking anywhere (including inside the number), or leaving the window commits the edit. The current tempo keeps playing while you type; arrows move the caret during editing. Only whole BPM values inside the current range are accepted. Anything else—including an empty value—becomes **120** without an error. If your custom range excludes 120, that boundary expands to include it so the display and slider stay in sync. No visible editing labels or input border are added.

Choose **1/4**, **1/8**, **1/16**, or **Swing** beside the BPM, or use Beat subdivision in the settings popup. Both controls stay in sync and save automatically. BPM always counts quarter-note beats. Swing plays at beat positions 0 and 2/3 (a 2:1 long–short feel). Added notes use a distinct, quieter, locally synthesized short tone; the selected click voice and bar accent still apply to the main beats. The beat count also follows the main beats. Changes to subdivision take effect at the next beat boundary. Arrow keys and Space operate the dropdown normally while it has focus; Tab away to use tempo shortcuts.

Choose beats per bar (**Off** or **2–12**, default 4) from the dropdown left of the BPM, or in the settings popup. Beat 1 plays a distinct downbeat voice for each click sound: wood rings a higher block, tick a bright ping, soft a gentle chime. The count row above the BPM shows which beat of the bar you're on, with beat 1 highlighted. Hide or show it with **Hide count** / **Show count**, the C key, or Beat count in settings. Shortening the bar while playing restarts on the next downbeat; lengthening it keeps counting.

While the metronome window has focus:

| Key | Action |
| --- | --- |
| Space | Start / stop |
| Up / Down | +1 / −1 BPM |
| Right / Left | +5 / −5 BPM |
| T | Tap tempo (average of the last six taps) |
| C | Show / hide the beat count |
| Escape | Hide and stop |
| Tab / Shift+Tab | Move through controls |
| Enter | Activate focused button |

Arrow keys use those same increments even when the slider is focused. Shortcuts aren't global: typing in another app or website won't change the metronome.

Click the extension icon for range (default 50–200; configurable within 20–400), sound, volume, beats per bar, beat count, size, and control opacity. Changes save automatically and apply live. The size preset sets the next floating window's initial size; an open floating window can also be manually resized. Chrome may impose minimum window dimensions.

Chrome does not expose true native-window transparency to extensions. The opacity control fades the metronome's contents, not the background or system title bar. The Show button supplies the user gesture Chrome requires for opening Picture-in-Picture.

## Implementation

Plain ES modules, HTML and CSS. Three locally synthesized Web Audio voices (wood, tick, soft); nothing to download. Audio is scheduled 120 ms ahead on the audio clock with a 25 ms scheduling loop. Sound changes may take up to that lookahead to be heard; tempo and subdivision changes take effect on the next unscheduled beat. Stop cancels queued oscillators immediately. Like any browser audio app, it cannot keep time through computer sleep or OS audio interruptions.

`background.js` prepares the background owner tab and serializes settings writes. The player owns all audio, so it cannot survive the player closing. No content scripts or access to websites.

After editing, click **Reload** on the extension's card at `chrome://extensions` and reopen the metronome.

## Checks

Run `node --test tests/*.test.js` for settings and audio lifecycle tests. For a manual smoke test: open/show twice (one player), start, use every shortcut including on the slider, change settings while playing, double-click/edit/commit BPM, try invalid input (120), close/hide while playing (silence), then reopen (stopped with saved settings).
