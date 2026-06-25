# Sticky Insert Mode Design

## Problem

Surfingkeys' Insert mode (`src/content_scripts/common/insert.js`) exits whenever a `keydown` or `focus` event's resolved target — via `getRealEdit()`, which drills into shadow roots looking for `input, textarea, select` — appears non-editable:

```js
// keydown handler, lines 207-216
var realTarget = getRealEdit(event);
if (!isEditable(realTarget)) {
    self.exit();
} else if (event.sk_keyName.length) {
    Mode.handleMapKey.call(self, event, function(last) { ... });
}
```

```js
// focus handler, lines 253-262
var realTarget = getRealEdit(event);
if (event.target != window && !isEditable(realTarget)) {
    self.exit();
} else {
    event.sk_suppressed = true;
}
```

This is unreliable as an exit signal for two reasons observed on Microsoft Teams:

1. `getRealEdit()`'s shadow-DOM fallback only matches `input, textarea, select` — it doesn't account for `contenteditable` elements nested inside a shadow root. Teams' message compose box is almost certainly `contenteditable` (needed for rich text). When a `focus` event's `event.target` is a shadow-DOM wrapper around that element (common with component-framework focus retargeting), `getRealEdit()` can resolve to the non-editable wrapper instead of the real editable descendant, and Insert mode exits even though the user did nothing to warrant it.
2. More generally, `focus`/`blur` events can be triggered by a page's own JavaScript (e.g. a framework silently replacing the DOM node behind an input during a re-render) with no real user action behind them at all — they are not a trustworthy signal of user intent to begin with.

The user-facing symptom: while typing into Teams' message box, keystrokes occasionally get diverted into Surfingkeys commands or Teams' own keyboard shortcuts instead of being typed, because Insert mode silently exited moments earlier due to one of these spurious events.

## Goal

Insert mode should only exit on an explicit, unambiguous user action: pressing Escape, or a genuine (trusted, mouse-driven) click on a different, non-editable part of the page. Nothing else — no programmatic focus/blur churn, no shadow-DOM retargeting quirk — should be able to end it.

## Design

All changes are scoped to `src/content_scripts/common/insert.js`.

### 1. `focus` handler — stop exiting on it

Replace:

```js
self.addEventListener('focus', function(event) {
    var realTarget = getRealEdit(event);
    if (event.target != window && !isEditable(realTarget)) {
        self.exit();
    } else {
        event.sk_suppressed = true;
    }
});
```

with:

```js
self.addEventListener('focus', function(event) {
    event.sk_suppressed = true;
});
```

A focus event landing somewhere that looks non-editable is no longer treated as "the user left." The event is still suppressed so it doesn't fall through to other modes' focus handling while Insert mode is active.

### 2. `keydown` handler — stop exiting on it

Replace:

```js
self.addEventListener('keydown', function(event) {
    if (event.key && event.key.charCodeAt(0) > 127) {
        event.sk_suppressed = true;
        return;
    }
    var realTarget = getRealEdit(event);
    if (!isEditable(realTarget)) {
        self.exit();
    } else if (event.sk_keyName.length) {
        Mode.handleMapKey.call(self, event, function(last) { ... });
    }
    event.sk_suppressed = true;
});
```

with (only the middle branch changes — the IME guard, the `Mode.handleMapKey` call body, and the trailing `event.sk_suppressed = true;` are otherwise unchanged):

```js
self.addEventListener('keydown', function(event) {
    if (event.key && event.key.charCodeAt(0) > 127) {
        event.sk_suppressed = true;
        return;
    }
    var realTarget = getRealEdit(event);
    if (isEditable(realTarget) && event.sk_keyName.length) {
        Mode.handleMapKey.call(self, event, function(last) { ... });
    }
    event.sk_suppressed = true;
});
```

If the resolved target momentarily looks non-editable, mapped-key processing for that one keystroke is skipped (there's nothing sensible to do with an insert-mode key sequence without an editable target), but Insert mode itself stays active.

### 3. New `mousedown` handler — the actual exit signal

Add a new listener (placed near the other lifecycle listeners in `createInsert()`):

```js
self.addEventListener('mousedown', function(event) {
    if (event.isTrusted && !isEditable(getRealEdit(event))) {
        self.exit();
    } else {
        event.sk_suppressed = true;
    }
});
```

`event.isTrusted` ensures only a real, physical mouse click can trigger this — not a page script dispatching a synthetic `mousedown`. Clicking on a *different* editable element does not exit (the `else` branch suppresses and lets the next keystroke's `insert.enter()` call from `normal.js` naturally re-target `_element` to the newly-focused field).

### Why this is safe

- Typing normally into any input/textarea/contenteditable is unaffected — nothing about how keys are processed while genuinely editable changes.
- Escape (`insert.js:163-175`, untouched) remains a full, explicit exit path.
- Clicking away to a non-editable area still exits, via the new trusted-mousedown check — strictly more reliable than the old focus-based check, since clicks can't be triggered by page scripts pretending to be the user the way focus events can.
- Clicking into a different editable element continues to work, switching the active target on the next keystroke as it already does today.
- Nothing about `Enter` needs to change — it already passes through to the page untouched when unmapped (the trailing `event.sk_suppressed = true;` only stops *other Surfingkeys modes* from also reacting to it; it does not call `preventDefault()` or stop the native keydown from reaching the page's own handler), so a Teams message-send-on-Enter (or any other site's Enter handling) continues to behave exactly as it does today.

## Testing approach

New file `tests/content_scripts/common/insert.test.js` (none currently exists). Tests:

1. Typing into a textarea processes keystrokes normally and Insert mode stays active throughout.
2. Escape exits Insert mode.
3. A trusted `mousedown` on a non-editable element exits Insert mode.
4. A trusted `mousedown` on a *different* editable element does not exit Insert mode.
5. **The regression test for the actual bug:** a `focus` event whose resolved target (`getRealEdit()`) is non-editable (simulating the shadow-DOM-wrapper-retargeting case) no longer exits Insert mode — Insert mode must still be active afterward, and a subsequent keystroke into a real editable element must still be processed normally.
6. A `keydown` event whose resolved target is momentarily non-editable does not exit Insert mode either (the keydown-handler analog of test 5).

## Out of scope

- Any change to `normal.js`'s `newlyCreated`/`stealFocus` heuristic (the originally-discussed narrower fix) — this design supersedes it as the chosen approach; the `stealFocus` heuristic itself is untouched and continues to exist for the case where Insert mode was never entered in the first place (an element auto-focuses on page load without the user ever having typed into anything).
- Any change to `getRealEdit()` itself (e.g. teaching its shadow-DOM fallback to also match `[contenteditable]`) — that would be a reasonable complementary improvement, but this design's robustness doesn't depend on fixing `getRealEdit()`'s precision, since it stops trusting focus/keydown-target-editability as an exit signal at all.
- Any change to `Mode.handleMapKey`, the mode stack/priority mechanism, or any file other than `insert.js`.
