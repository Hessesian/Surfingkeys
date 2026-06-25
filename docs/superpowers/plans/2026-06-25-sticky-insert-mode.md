# Sticky Insert Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Insert mode exit only on Escape or a genuine (trusted) mouse click on a non-editable element — never on a `focus` or `keydown` event whose resolved target merely *looks* non-editable — fixing intermittent typing interruptions on sites like Microsoft Teams where that signal is unreliable.

**Architecture:** Two existing event handlers in `src/content_scripts/common/insert.js` (`focus`, `keydown`) lose their `self.exit()` branches; a new `mousedown` handler becomes the sole "user clicked away" signal, gated on `event.isTrusted` so page scripts can't fake it.

**Tech Stack:** Plain JS (Webpack-bundled content script), Jest + jsdom for tests.

## Global Constraints

- Do not change `Mode.handleMapKey`, the mode stack/priority mechanism (`src/content_scripts/common/mode.js`), `normal.js`'s `newlyCreated`/`stealFocus` heuristic, or `getRealEdit()` itself — only `insert.js`'s three handlers change.
- The Escape mapping (`insert.js:163-175`) is untouched.
- Run `npx jest` after the task; all tests must stay green. The repo has 3 pre-existing failing suites (`tests/background/start.test.js`, `tests/content_scripts/common/normal.test.js`, `tests/content_scripts/markdown.test.js`) unrelated to this work — confirm failures don't change in count/names.
- Run `npx webpack --mode=development --config ./config/webpack.config.js` after the task to confirm the bundle still builds.
- This is a single, small, behavior-narrowing task — no branch/worktree isolation needed; work directly on `master` (current HEAD at plan-writing time: `adb5bc2`), per the same explicit user consent already given for direct-master work this session.

---

### Task 1: Sticky Insert mode exit conditions

**Files:**
- Modify: `src/content_scripts/common/insert.js:207-262`
- Test: `tests/content_scripts/common/insert.test.js` (new file)

**Interfaces:**
- Consumes: `getRealEdit`, `isEditable` (already imported in `insert.js`).
- Produces: no new exported names — `createInsert()`'s default export keeps its existing signature (no parameters, returns a `Mode` instance). The new `mousedown` listener is internal; nothing outside `insert.js` calls it directly.

- [ ] **Step 1: Write the failing tests**

Create `tests/content_scripts/common/insert.test.js`:

```js
describe('insert mode exit conditions', () => {
    let insert, Mode;

    beforeAll(() => {
        global.chrome = {
            runtime: {
                sendMessage: jest.fn(),
                getURL: jest.fn(),
                onMessage: { addListener: jest.fn() }
            },
            extension: { getURL: jest.fn() }
        };
        global.DOMRect = jest.fn();

        Mode = require('src/content_scripts/common/mode.js').default;
        Mode.init();
        insert = require('src/content_scripts/common/insert.js').default();
    });

    afterEach(() => {
        document.body.innerHTML = '';
        insert.exit();
    });

    function makeTextarea() {
        const el = document.createElement('textarea');
        document.body.appendChild(el);
        return el;
    }

    test('typing into a textarea keeps Insert mode active', () => {
        const textarea = makeTextarea();
        insert.enter(textarea, true);
        expect(Mode.getCurrent()).toBe(insert);

        insert.eventListeners['keydown']({ key: 'a', sk_keyName: '', target: textarea });

        expect(Mode.getCurrent()).toBe(insert);
    });

    test('Escape exits Insert mode', () => {
        const textarea = makeTextarea();
        insert.enter(textarea, true);
        expect(Mode.getCurrent()).toBe(insert);

        insert.exit();

        expect(Mode.getCurrent()).not.toBe(insert);
    });

    test('a trusted mousedown on a non-editable element exits Insert mode', () => {
        const textarea = makeTextarea();
        const nonEditable = document.createElement('div');
        document.body.appendChild(nonEditable);
        insert.enter(textarea, true);
        expect(Mode.getCurrent()).toBe(insert);

        insert.eventListeners['mousedown']({ isTrusted: true, target: nonEditable });

        expect(Mode.getCurrent()).not.toBe(insert);
    });

    test('a trusted mousedown on a different editable element does not exit Insert mode', () => {
        const textarea = makeTextarea();
        const otherTextarea = makeTextarea();
        insert.enter(textarea, true);
        expect(Mode.getCurrent()).toBe(insert);

        insert.eventListeners['mousedown']({ isTrusted: true, target: otherTextarea });

        expect(Mode.getCurrent()).toBe(insert);
    });

    test('a focus event resolving to a non-editable target does not exit Insert mode (regression)', () => {
        const textarea = makeTextarea();
        const shadowWrapper = document.createElement('div');
        document.body.appendChild(shadowWrapper);
        insert.enter(textarea, true);
        expect(Mode.getCurrent()).toBe(insert);

        // Simulates getRealEdit() resolving to a non-editable shadow-DOM
        // wrapper instead of the real contenteditable element inside it
        // (the actual bug on Microsoft Teams).
        insert.eventListeners['focus']({ target: shadowWrapper });

        expect(Mode.getCurrent()).toBe(insert);
    });

    test('a keydown event resolving to a non-editable target does not exit Insert mode', () => {
        const textarea = makeTextarea();
        const nonEditable = document.createElement('div');
        document.body.appendChild(nonEditable);
        insert.enter(textarea, true);
        expect(Mode.getCurrent()).toBe(insert);

        insert.eventListeners['keydown']({ key: 'a', sk_keyName: '', target: nonEditable });

        expect(Mode.getCurrent()).toBe(insert);
    });
});
```

Note: tests call `insert.eventListeners['mousedown']`/`['focus']`/`['keydown']` directly (the handler functions, exposed by `Mode`'s `addEventListener` via `this.eventListeners[evtName] = handler;`) rather than dispatching real DOM events. This is deliberate, not a shortcut: real `MouseEvent`/`KeyboardEvent` objects in jsdom (and in any spec-compliant browser) have a non-configurable, constructor-immutable `isTrusted` property that is always `false` for script-created events — there is no way to make a dispatched synthetic event report `isTrusted: true`. Calling the handler directly with a plain object carrying exactly the properties it reads (`target`, `isTrusted`, `key`, `sk_keyName`) is the only way to exercise the trusted-mousedown branch at all, and it tests the real production handler function, not a mock of it.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest tests/content_scripts/common/insert.test.js`
Expected: the first test ("typing into a textarea keeps Insert mode active") and the "Escape exits" test should already PASS today (today's code doesn't exit on a textarea-targeted keydown, and Escape already works) — these are characterization tests. The "trusted mousedown on a non-editable element exits" test FAILS today with `TypeError: insert.eventListeners['mousedown'] is not a function` — there is no `mousedown` listener registered yet. The "mousedown on a different editable element does not exit" test also fails the same way (no handler exists, so calling it throws). The two regression tests ("focus event resolving to non-editable... does not exit" and "keydown event resolving to non-editable... does not exit") FAIL with `expect(received).toBe(expected)` — `Mode.getCurrent()` will be `undefined`, not `insert`, because today's code calls `self.exit()` in both of those handlers when the target looks non-editable.

- [ ] **Step 3: Implement**

In `src/content_scripts/common/insert.js`, replace lines 207-262:

```js
    self.addEventListener('keydown', function(event) {
        if (event.key && event.key.charCodeAt(0) > 127) {
            // IME is opened.
            event.sk_suppressed = true;
            return;
        }
        // prevent this event to be handled by Surfingkeys' other listeners
        var realTarget = getRealEdit(event);
        if (!isEditable(realTarget)) {
            self.exit();
        } else if (event.sk_keyName.length) {
            Mode.handleMapKey.call(self, event, function(last) {
                // for insert mode to insert unmapped chars with preceding chars same as some mapkeys
                // such as, to insert `,m` in case of mapkey `,,` defined.
                var pw = last.getPrefixWord();
                if (pw) {
                    var elm = getRealEdit(), str = elm.value, pos = elm.selectionStart;
                    if (str !== undefined && pos !== undefined) {
                        elm.value = str.substr(0, elm.selectionStart) + pw + str.substr(elm.selectionEnd);
                        pos += pw.length;
                        elm.setSelectionRange(pos, pos);
                    } else {
                        elm = document.getSelection();
                        var range = elm.getRangeAt(0);
                        var n = document.createTextNode(pw);
                        if (elm.type === "Caret") {
                            str = elm.focusNode.data;
                            if (str === undefined) {
                                range.insertNode(n);
                                elm.setPosition(n, n.length);
                            } else {
                                pos = elm.focusOffset;
                                elm.focusNode.data = str.substr(0, pos) + pw + str.substr(pos);
                                elm.setPosition(elm.focusNode, pos + pw.length);
                            }
                        } else {
                            range.deleteContents();
                            range.insertNode(n);
                            elm.setPosition(n, n.length);
                        }
                    }
                }
            });
        }
        event.sk_suppressed = true;
    });
    self.addEventListener('focus', function(event) {
        var realTarget = getRealEdit(event);
        // We get a focus event with target = window when the browser window looses focus.
        // Ignore this event.
        if (event.target != window && !isEditable(realTarget)) {
            self.exit();
        } else {
            event.sk_suppressed = true;
        }
    });
```

with:

```js
    self.addEventListener('keydown', function(event) {
        if (event.key && event.key.charCodeAt(0) > 127) {
            // IME is opened.
            event.sk_suppressed = true;
            return;
        }
        // prevent this event to be handled by Surfingkeys' other listeners
        var realTarget = getRealEdit(event);
        if (isEditable(realTarget) && event.sk_keyName.length) {
            Mode.handleMapKey.call(self, event, function(last) {
                // for insert mode to insert unmapped chars with preceding chars same as some mapkeys
                // such as, to insert `,m` in case of mapkey `,,` defined.
                var pw = last.getPrefixWord();
                if (pw) {
                    var elm = getRealEdit(), str = elm.value, pos = elm.selectionStart;
                    if (str !== undefined && pos !== undefined) {
                        elm.value = str.substr(0, elm.selectionStart) + pw + str.substr(elm.selectionEnd);
                        pos += pw.length;
                        elm.setSelectionRange(pos, pos);
                    } else {
                        elm = document.getSelection();
                        var range = elm.getRangeAt(0);
                        var n = document.createTextNode(pw);
                        if (elm.type === "Caret") {
                            str = elm.focusNode.data;
                            if (str === undefined) {
                                range.insertNode(n);
                                elm.setPosition(n, n.length);
                            } else {
                                pos = elm.focusOffset;
                                elm.focusNode.data = str.substr(0, pos) + pw + str.substr(pos);
                                elm.setPosition(elm.focusNode, pos + pw.length);
                            }
                        } else {
                            range.deleteContents();
                            range.insertNode(n);
                            elm.setPosition(n, n.length);
                        }
                    }
                }
            });
        }
        event.sk_suppressed = true;
    });
    self.addEventListener('focus', function(event) {
        event.sk_suppressed = true;
    });
    self.addEventListener('mousedown', function(event) {
        // Only a real, physical mouse click can exit Insert mode here —
        // event.isTrusted guards against a page script dispatching a
        // synthetic mousedown to fake the user clicking away. A focus or
        // keydown event whose target merely *looks* non-editable is not
        // trustworthy on its own (see the removed exit branches above):
        // it can be triggered by the page's own re-renders, or by
        // getRealEdit() resolving through a shadow-DOM wrapper that isn't
        // itself editable even though a real editable element is nested
        // inside it.
        if (event.isTrusted && !isEditable(getRealEdit(event))) {
            self.exit();
        } else {
            event.sk_suppressed = true;
        }
    });
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest tests/content_scripts/common/insert.test.js`
Expected: PASS, all 6 tests green.

- [ ] **Step 5: Run the full suite to check for regressions**

Run: `npx jest`
Expected: same 3 pre-existing failing suites as noted in Global Constraints, no new failures.

- [ ] **Step 6: Build the extension**

Run: `npx webpack --mode=development --config ./config/webpack.config.js`
Expected: `webpack ... compiled successfully`, no new errors.

- [ ] **Step 7: Commit**

```bash
git add src/content_scripts/common/insert.js tests/content_scripts/common/insert.test.js
git commit -m "fix: only exit Insert mode on Escape or a trusted click, not focus/keydown heuristics"
```

---

### Task 2: Manual verification

**Files:** none (verification only)

- [ ] **Step 1: Rebuild and reload**

Run: `npx webpack --mode=development --config ./config/webpack.config.js` (if not already current from Task 1, Step 6).
In the browser where the unpacked extension from `dist/development/chrome` is loaded, click the reload icon on the extension's card, then refresh any already-open test tabs.

- [ ] **Step 2: Verify ordinary typing still works**

On any normal page with a text input (e.g. a search box), click into it and type a sentence including letters that are normally Surfingkeys hotkeys (`f`, `j`, `k`, `i`). Confirm every character is typed normally and no Surfingkeys action fires.

- [ ] **Step 3: Verify Escape still exits**

While typing in that same input, press Escape. Confirm focus leaves the input (or at least Surfingkeys' Insert mode visibly exits, e.g. via the status line if shown) and `j`/`k` work again afterward.

- [ ] **Step 4: Verify clicking away still exits**

Click into a text input, then click on a clearly non-editable part of the page (e.g. a heading or blank area). Confirm `j`/`k`/`f` work again afterward (Insert mode exited).

- [ ] **Step 5: Verify the Microsoft Teams fix**

On Microsoft Teams (web), type a longer message (several seconds of typing) into the message compose box. Confirm no keystroke gets diverted into a Surfingkeys action or a Teams keyboard shortcut partway through — the whole message should type out cleanly.

- [ ] **Step 6: Commit (if Step 2-5 surfaced any fixes)**

Only if manual testing required a fix:

```bash
git add -A
git commit -m "fix: <describe what manual testing caught>"
```
