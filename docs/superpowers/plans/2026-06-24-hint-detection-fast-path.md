# Hint Detection Fast-Path Rewrite Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate the full-DOM scan that `f` (and other hint modes) currently performs on every keypress, by driving clickable/editable element discovery from `querySelectorAll` instead of visiting every node in the document.

**Architecture:** `getVisibleElements()` in `src/content_scripts/common/utils.js` walks every element in the document, calling `getBoundingClientRect()` and `getComputedStyle()` on each one before any filtering happens. Most of those nodes can never be hint targets. We add a selector-driven alternative, `getVisibleElementsBySelector()`, that gathers candidates via `querySelectorAll` (including shadow roots) first, and only then runs the (cheap, because the candidate set is now small) viewport/visibility checks. The one piece of detection logic that genuinely cannot be expressed as a CSS selector — "this element's *computed* `cursor` is `pointer`" — is split out into its own function, `isElementClickableByCursor()`, and is **not run by default** when the fast structural pass already found something. Instead, `createHintsForClick` tries the fast selector pass first and only falls back to the full-DOM cursor scan when that pass returns **zero** elements — covering the case of pages built entirely from non-semantic clickable `<div>`s without paying the full-scan cost on every other page. A `runtime.conf.detectClickableByCursor` flag (default `false`) additionally lets users force the cursor scan to run *every* time, for the rarer case of a page that mixes semantic links with non-semantic clickable divs (where the zero-results fallback wouldn't trigger, since the structural pass already found the semantic links).

**Tech Stack:** Plain JS (Webpack-bundled content script), Jest + jsdom for tests.

## Global Constraints

- Do not change the behavior or signature of the exported `isElementClickable(e)` function — it is called elsewhere (`normal.js:1018`) on a single element, where the full-scan cost does not apply, and must keep its current semantics (selector match OR cursor:pointer OR `closest()` match) unconditionally.
- Do not touch `createHintsForTextNode` (text-hint mode) — its filter predicate (text-bearing child nodes) cannot be selector-ized and is a much colder path. Out of scope for this plan.
- Preserve exact behavior of `Array.isArray(cssSelector)` branch in `createHintsForClick` (used by `Hints.click(elementsArray, ...)`) — it does not go through `getVisibleElements` today and must not be touched.
- All new/changed functions must keep existing JSDoc/export conventions in `utils.js` (named function, added to the `export { ... }` block at the bottom, alphabetically placed near related entries is not required — append is fine, the existing list is not strictly sorted in a few places).
- Run `npx jest` after every task; all tests must stay green. The repo currently has 3 pre-existing failing suites (`tests/background/start.test.js`, `tests/content_scripts/common/normal.test.js`, `tests/content_scripts/markdown.test.js`) unrelated to this work — confirm failures don't change in count/names before/after each task, don't try to fix them.
- Run `npx webpack --mode=development --config ./config/webpack.config.js` after the final task to confirm the bundle still builds.

---

### Task 1: Add `detectClickableByCursor` config flag

**Files:**
- Modify: `src/content_scripts/common/runtime.js:53`

**Interfaces:**
- Produces: `runtime.conf.detectClickableByCursor` (boolean, default `false`) — when `true`, forces the cursor-based heuristic scan to run on every `f` press even if the fast structural pass already found elements (see Task 4, which also adds an automatic fallback for the zero-results case regardless of this flag).

- [ ] **Step 1: Add the flag**

In `src/content_scripts/common/runtime.js`, find this block (around line 51-54):

```js
            caseSensitive: false,
            clickablePat: /(https?:\/\/|thunder:\/\/|magnet:)\S+/ig,
            clickableSelector: "",
            editableSelector: "div.CodeMirror-scroll,div.ace_content",
```

Change it to:

```js
            caseSensitive: false,
            clickablePat: /(https?:\/\/|thunder:\/\/|magnet:)\S+/ig,
            clickableSelector: "",
            detectClickableByCursor: false,
            editableSelector: "div.CodeMirror-scroll,div.ace_content",
```

- [ ] **Step 2: Verify nothing else broke**

Run: `npx jest tests/content_scripts/common/normal.test.js`
Expected: same pass/fail counts as before this change (this file already has pre-existing failures unrelated to this flag — just confirm the count didn't get worse).

- [ ] **Step 3: Commit**

```bash
git add src/content_scripts/common/runtime.js
git commit -m "feat: add detectClickableByCursor config flag (default off)"
```

---

### Task 2: Split `isElementClickable` into selector-only and cursor-only halves

**Files:**
- Modify: `src/content_scripts/common/utils.js:243-256`
- Test: `tests/content_scripts/common/utils.test.js`

**Interfaces:**
- Consumes: `runtime.conf.clickableSelector` (existing).
- Produces:
  - `getStructuralClickableSelector()` → returns the CSS selector string (no DOM query), used by Task 4.
  - `isElementClickableByCursor(e)` → returns boolean, used by Task 4.
  - `isElementClickable(e)` → unchanged behavior, now implemented as `e.matches(getStructuralClickableSelector()) || isElementClickableByCursor(e)`.

- [ ] **Step 1: Write the failing test**

Add to `tests/content_scripts/common/utils.test.js` (inside the existing `describe('utils performance', ...)` block — add to the `beforeAll` destructuring and add two new `test()` blocks):

```js
describe('utils performance', () => {
    let isElementClickable, getZIndex, getStructuralClickableSelector, isElementClickableByCursor;

    beforeAll(() => {
        global.chrome = {
            runtime: {
                sendMessage: jest.fn(),
                onMessage: {
                    addListener: jest.fn()
                }
            },
            extension: {
                getURL: jest.fn()
            }
        };
        global.DOMRect = jest.fn();

        const utils = require('src/content_scripts/common/utils.js');
        isElementClickable = utils.isElementClickable;
        getZIndex = utils.getZIndex;
        getStructuralClickableSelector = utils.getStructuralClickableSelector;
        isElementClickableByCursor = utils.isElementClickableByCursor;
    });

    // ... existing tests stay as-is ...

    test('getStructuralClickableSelector returns a selector that matches anchors', () => {
        document.body.innerHTML = '<a id="link" href="#"></a><div id="plain"></div>';
        const selector = getStructuralClickableSelector();
        expect(document.getElementById('link').matches(selector)).toBe(true);
        expect(document.getElementById('plain').matches(selector)).toBe(false);
    });

    test('isElementClickableByCursor detects cursor:pointer styling on a non-semantic div', () => {
        document.body.innerHTML = '<div id="fake-button" style="cursor: pointer;"></div><div id="plain"></div>';
        expect(isElementClickableByCursor(document.getElementById('fake-button'))).toBe(true);
        expect(isElementClickableByCursor(document.getElementById('plain'))).toBe(false);
    });

    test('isElementClickable still returns true via the cursor fallback (unchanged public behavior)', () => {
        document.body.innerHTML = '<div id="fake-button" style="cursor: pointer;"></div>';
        expect(isElementClickable(document.getElementById('fake-button'))).toBe(true);
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/content_scripts/common/utils.test.js`
Expected: FAIL — `getStructuralClickableSelector` and `isElementClickableByCursor` are `undefined` (not exported yet), so the first two new tests throw `TypeError: getStructuralClickableSelector is not a function` / similar. The third test currently passes already (don't worry about that one yet — it's there to lock in the no-regression contract once the refactor lands).

- [ ] **Step 3: Implement**

In `src/content_scripts/common/utils.js`, replace lines 243-256:

```js
function isElementClickable(e) {
    var cssSelector = "a, button, select, input, textarea, summary, *[onclick], *[contenteditable=true], *.jfk-button, *.goog-flat-menu-button, *[role=button], *[role=link], *[role=menuitem], *[role=option], *[role=switch], *[role=tab], *[role=checkbox], *[role=combobox], *[role=menuitemcheckbox], *[role=menuitemradio]";
    if (runtime.conf.clickableSelector.length) {
        cssSelector += ", " + runtime.conf.clickableSelector;
    }

    if (e.matches(cssSelector)) {
        return true;
    }
    var cursor = getComputedStyle(e).cursor;
    return cursor === "pointer"
        || cursor.substr(0, 4) === "url("
        || e.closest("a, *[onclick], *[contenteditable=true], *.jfk-button, *.goog-flat-menu-button") !== null;
}
```

with:

```js
/**
 * The CSS selector for elements that are clickable purely by markup
 * (semantic tags, ARIA roles, or `runtime.conf.clickableSelector`).
 * This selector is safe to pass to `querySelectorAll` directly, unlike
 * the cursor-based heuristic in `isElementClickableByCursor`.
 *
 * @returns {string}
 */
function getStructuralClickableSelector() {
    var cssSelector = "a, button, select, input, textarea, summary, *[onclick], *[contenteditable=true], *.jfk-button, *.goog-flat-menu-button, *[role=button], *[role=link], *[role=menuitem], *[role=option], *[role=switch], *[role=tab], *[role=checkbox], *[role=combobox], *[role=menuitemcheckbox], *[role=menuitemradio]";
    if (runtime.conf.clickableSelector.length) {
        cssSelector += ", " + runtime.conf.clickableSelector;
    }
    return cssSelector;
}

/**
 * Detect elements that are clickable only by virtue of computed style
 * (`cursor: pointer` or a custom cursor image) or by being a descendant
 * of a clickable container. This cannot be expressed as a CSS selector,
 * so checking it for every element on a page requires visiting every
 * element — callers should only do that when
 * `runtime.conf.detectClickableByCursor` is enabled.
 *
 * @param {Element} e
 * @returns {boolean}
 */
function isElementClickableByCursor(e) {
    var cursor = getComputedStyle(e).cursor;
    return cursor === "pointer"
        || cursor.substr(0, 4) === "url("
        || e.closest("a, *[onclick], *[contenteditable=true], *.jfk-button, *.goog-flat-menu-button") !== null;
}

function isElementClickable(e) {
    return e.matches(getStructuralClickableSelector()) || isElementClickableByCursor(e);
}
```

Then add both new functions to the `export { ... }` block at the bottom of the file, next to the existing `isElementClickable` entry:

```js
    getStructuralClickableSelector,
    isElementClickable,
    isElementClickableByCursor,
```

(insert `getStructuralClickableSelector,` alphabetically near `getRealRect`/`getRealEdit` is not required — just make sure all three names appear somewhere in the export block.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest tests/content_scripts/common/utils.test.js`
Expected: PASS, all tests in this file green.

- [ ] **Step 5: Commit**

```bash
git add src/content_scripts/common/utils.js tests/content_scripts/common/utils.test.js
git commit -m "refactor: split isElementClickable into selector-only and cursor-only halves"
```

---

### Task 3: Add `querySelectorAllDeep` and `getVisibleElementsBySelector`

**Files:**
- Modify: `src/content_scripts/common/utils.js` (add near `getVisibleElements`, around line 446-468)
- Test: `tests/content_scripts/common/utils.test.js`

**Interfaces:**
- Consumes: nothing new.
- Produces:
  - `querySelectorAllDeep(cssSelector)` → `Array<Element>`, matches `cssSelector` against `document` and recursively against every shadow root found anywhere in the document. Used by Task 4/5.
  - `getVisibleElementsBySelector(cssSelector, extraFilter)` → `Array<Element>`, same viewport/visibility semantics as `getVisibleElements`, but candidates come from `querySelectorAllDeep(cssSelector)` instead of a full-document scan. `extraFilter(e)` is an optional predicate applied after the visibility check. Used by Task 4/5.

- [ ] **Step 1: Write the failing test**

Add to `tests/content_scripts/common/utils.test.js`:

```js
describe('querySelectorAllDeep', () => {
    let querySelectorAllDeep;

    beforeAll(() => {
        global.chrome = {
            runtime: { sendMessage: jest.fn(), onMessage: { addListener: jest.fn() } },
            extension: { getURL: jest.fn() }
        };
        global.DOMRect = jest.fn();
        querySelectorAllDeep = require('src/content_scripts/common/utils.js').querySelectorAllDeep;
    });

    test('matches elements in the light DOM', () => {
        document.body.innerHTML = '<a id="a1" href="#"></a><div></div><a id="a2" href="#"></a>';
        const result = querySelectorAllDeep('a');
        expect(result.map((e) => e.id).sort()).toEqual(['a1', 'a2']);
    });

    test('matches elements nested inside a shadow root', () => {
        document.body.innerHTML = '<div id="host"></div>';
        const host = document.getElementById('host');
        const root = host.attachShadow({ mode: 'open' });
        root.innerHTML = '<a id="shadow-link" href="#"></a>';

        const result = querySelectorAllDeep('a');
        expect(result.map((e) => e.id)).toEqual(['shadow-link']);
    });
});

describe('getVisibleElementsBySelector', () => {
    let getVisibleElementsBySelector;
    let realGetBoundingClientRect;

    beforeAll(() => {
        global.chrome = {
            runtime: { sendMessage: jest.fn(), onMessage: { addListener: jest.fn() } },
            extension: { getURL: jest.fn() }
        };
        global.DOMRect = jest.fn();
        getVisibleElementsBySelector = require('src/content_scripts/common/utils.js').getVisibleElementsBySelector;
        realGetBoundingClientRect = Element.prototype.getBoundingClientRect;
    });

    afterEach(() => {
        Element.prototype.getBoundingClientRect = realGetBoundingClientRect;
    });

    function mockOnscreenRect() {
        Element.prototype.getBoundingClientRect = function() {
            return { top: 0, bottom: 10, left: 0, right: 10, width: 10, height: 10 };
        };
    }

    test('only returns elements matching the selector that are on screen', () => {
        document.body.innerHTML = '<a id="onscreen" href="#"></a><div id="not-a-link"></div>';
        mockOnscreenRect();

        const result = getVisibleElementsBySelector('a');
        expect(result.map((e) => e.id)).toEqual(['onscreen']);
    });

    test('excludes elements with zero-height rects (offscreen/collapsed)', () => {
        document.body.innerHTML = '<a id="collapsed" href="#"></a>';
        Element.prototype.getBoundingClientRect = function() {
            return { top: 0, bottom: 0, left: 0, right: 0, width: 0, height: 0 };
        };

        const result = getVisibleElementsBySelector('a');
        expect(result).toEqual([]);
    });

    test('applies the optional extraFilter after the visibility check', () => {
        document.body.innerHTML = '<input id="enabled"><input id="disabled" disabled>';
        mockOnscreenRect();

        const result = getVisibleElementsBySelector('input', (e) => !e.disabled);
        expect(result.map((e) => e.id)).toEqual(['enabled']);
    });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest tests/content_scripts/common/utils.test.js`
Expected: FAIL — `querySelectorAllDeep` and `getVisibleElementsBySelector` are `undefined`, causing `TypeError: ... is not a function`.

- [ ] **Step 3: Implement**

In `src/content_scripts/common/utils.js`, immediately after the `getVisibleElements` function (after line 468), add:

```js
/**
 * Find every shadow root nested anywhere under `root` (recursively).
 * Walking `root.querySelectorAll('*')` to find shadow hosts is cheap —
 * it's a property read per element, not a forced style/layout
 * computation — unlike the per-element `getBoundingClientRect`/
 * `getComputedStyle` calls in `getVisibleElements`.
 *
 * @param {Document|ShadowRoot} root
 * @returns {Array<ShadowRoot>}
 */
function getShadowRootsDeep(root) {
    var roots = [];
    var hosts = root.querySelectorAll('*');
    for (var i = 0; i < hosts.length; i++) {
        if (hosts[i].shadowRoot) {
            roots.push(hosts[i].shadowRoot);
            roots = roots.concat(getShadowRootsDeep(hosts[i].shadowRoot));
        }
    }
    return roots;
}

/**
 * Like `document.querySelectorAll(cssSelector)`, but also matches inside
 * every shadow root in the document.
 *
 * @param {string} cssSelector
 * @returns {Array<Element>}
 */
function querySelectorAllDeep(cssSelector) {
    var result = Array.from(document.querySelectorAll(cssSelector));
    var shadowRoots = getShadowRootsDeep(document);
    for (var i = 0; i < shadowRoots.length; i++) {
        result = result.concat(Array.from(shadowRoots[i].querySelectorAll(cssSelector)));
    }
    return result;
}

/**
 * Like `getVisibleElements`, but starts from the (usually much smaller)
 * set of elements matching `cssSelector` instead of scanning every
 * element in the document. Use this whenever the desired elements can be
 * expressed as a CSS selector — it avoids the expensive
 * `getBoundingClientRect`/`getComputedStyle` calls for every irrelevant
 * node on the page.
 *
 * @param {string} cssSelector
 * @param {function(Element): boolean} [extraFilter] optional predicate
 *   applied after the viewport/visibility check.
 * @returns {Array<Element>}
 */
function getVisibleElementsBySelector(cssSelector, extraFilter) {
    var candidates = querySelectorAllDeep(cssSelector);
    var visibleElements = [];
    for (var i = 0; i < candidates.length; i++) {
        var e = candidates[i];
        var rect = e.getBoundingClientRect();
        if ((rect.top <= window.innerHeight) && (rect.bottom >= 0)
            && (rect.left <= window.innerWidth) && (rect.right >= 0)
            && rect.height > 0
            && getComputedStyle(e).visibility !== 'hidden'
            && (!extraFilter || extraFilter(e))
        ) {
            visibleElements.push(e);
        }
    }
    return visibleElements;
}
```

Add the three new names to the `export { ... }` block at the bottom of the file:

```js
    getShadowRootsDeep,
    getVisibleElementsBySelector,
    querySelectorAllDeep,
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest tests/content_scripts/common/utils.test.js`
Expected: PASS, all tests in this file green.

- [ ] **Step 5: Commit**

```bash
git add src/content_scripts/common/utils.js tests/content_scripts/common/utils.test.js
git commit -m "feat: add selector-driven candidate search to avoid full-DOM scans"
```

---

### Task 4: Wire `createHintsForClick` to the fast path

**Files:**
- Modify: `src/content_scripts/common/hints.js:5-28` (imports), `:793-817` (`createHintsForClick`)
- Test: `tests/content_scripts/common/hints.test.js` (new file)

**Interfaces:**
- Consumes: `getStructuralClickableSelector`, `isElementClickableByCursor`, `getVisibleElementsBySelector` (Tasks 2-3), `runtime.conf.detectClickableByCursor` (Task 1).
- Produces: no new public interface — `self.create(cssSelector, onHintKey, attrs)` (existing public API) keeps its existing signature and return value (a `Promise<number>` resolving to the hint count).

- [ ] **Step 1: Write the failing test**

Create `tests/content_scripts/common/hints.test.js`:

```js
describe('hints click detection', () => {
    let hints, runtime, Mode;
    let realGetBoundingClientRect;

    beforeAll(() => {
        global.chrome = {
            runtime: {
                sendMessage: jest.fn(),
                onMessage: { addListener: jest.fn() }
            },
            extension: { getURL: jest.fn() }
        };
        global.DOMRect = jest.fn();

        runtime = require('src/content_scripts/common/runtime.js').runtime;
        Mode = require('src/content_scripts/common/mode.js').default;
        Mode.init();
        const insert = require('src/content_scripts/common/insert.js').default();
        const normal = require('src/content_scripts/common/normal.js').default(insert);
        hints = require('src/content_scripts/common/hints.js').default(insert, normal, {});

        realGetBoundingClientRect = Element.prototype.getBoundingClientRect;
        Element.prototype.getBoundingClientRect = function() {
            return { top: 0, bottom: 10, left: 0, right: 10, width: 10, height: 10 };
        };
    });

    afterAll(() => {
        Element.prototype.getBoundingClientRect = realGetBoundingClientRect;
    });

    afterEach(() => {
        document.body.innerHTML = '';
        if (Mode.getCurrent() === hints) {
            hints.exit();
        }
        runtime.conf.detectClickableByCursor = false;
    });

    test('finds structurally clickable elements regardless of detectClickableByCursor', async () => {
        document.body.innerHTML = '<a id="a1" href="#"></a><a id="a2" href="#"></a><div id="plain"></div>';

        const found = await hints.create("", function() {});
        expect(found).toBe(2);
    });

    test('ignores a non-semantic cursor:pointer div by default', async () => {
        document.body.innerHTML = '<a id="a1" href="#"></a><a id="a2" href="#"></a><div id="fake-button" style="cursor: pointer;"></div>';
        runtime.conf.detectClickableByCursor = false;

        const found = await hints.create("", function() {});
        expect(found).toBe(2);
    });

    test('includes a non-semantic cursor:pointer div when detectClickableByCursor is enabled', async () => {
        document.body.innerHTML = '<a id="a1" href="#"></a><a id="a2" href="#"></a><div id="fake-button" style="cursor: pointer;"></div>';
        runtime.conf.detectClickableByCursor = true;

        const found = await hints.create("", function() {});
        expect(found).toBe(3);
    });

    test('falls back to the cursor heuristic automatically when the page has no structurally-clickable elements at all', async () => {
        document.body.innerHTML = '<div id="fake1" style="cursor: pointer;"></div><div id="fake2" style="cursor: pointer;"></div><div id="plain"></div>';
        runtime.conf.detectClickableByCursor = false;

        const found = await hints.create("", function() {});
        expect(found).toBe(2);
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/content_scripts/common/hints.test.js`
Expected: the first test (structural elements) likely already passes today since `isElementClickable` already finds anchors via the old full scan. The second test (`ignores ... by default`) must currently FAIL, since today's `createHintsForClick` always includes cursor-styled elements unconditionally (`found` would be 3, not the expected 2) — there is no gating logic yet. The fourth test (automatic fallback) currently PASSES already, since the old code finds cursor-styled elements unconditionally regardless of structural results — that's fine, it's there to lock in the fallback behavior once gating is added in Step 3. Confirm you see the second test fail with `expected 2, got 3` before proceeding — if a different test fails instead, stop and re-read the diff against current behavior.

- [ ] **Step 3: Implement**

In `src/content_scripts/common/hints.js`, update the import block (lines 5-28). Note that `isElementClickable` is removed from this list — after this task it has no remaining callers in `hints.js` (its two pieces, `getStructuralClickableSelector` and `isElementClickableByCursor`, are now called directly instead):

```js
import {
    createElementWithContent,
    dispatchMouseEvent,
    filterInvisibleElements,
    filterOverlapElements,
    flashPressedLink,
    getAnnotations,
    getBrowserName,
    getClickableElements,
    getColor,
    getCssSelectorsOfEditable,
    getRealRect,
    getStructuralClickableSelector,
    getTextNodePos,
    getVisibleElements,
    getVisibleElementsBySelector,
    getZIndex,
    htmlEncode,
    initSKFunctionListener,
    isEditable,
    isElementClickableByCursor,
    isElementDrawn,
    openOmnibar,
    refreshHints,
    setSanitizedContent,
} from './utils.js';
```

Then replace the `createHintsForClick` body (lines 793-810):

```js
        if (cssSelector === "") {
            elements = getVisibleElements(function(e, v) {
                if (isElementClickable(e)) {
                    v.push(e);
                }
            });
            elements = filterOverlapElements(elements);
        } else if (Array.isArray(cssSelector)) {
            elements = filterInvisibleElements(cssSelector);
        } else {
            elements = getVisibleElements(function (e, v) {
                if (e.matches(cssSelector) && !e.disabled && !e.readOnly) {
                    v.push(e);
                }
            });
            elements = filterInvisibleElements(elements);
            elements = filterOverlapElements(elements);
        }
```

with:

```js
        if (cssSelector === "") {
            elements = getVisibleElementsBySelector(getStructuralClickableSelector());
            // Fall back to the expensive full-DOM cursor heuristic when the
            // fast pass found nothing (page built entirely from non-semantic
            // markup), or when the user has explicitly asked for it every time.
            if (elements.length === 0 || runtime.conf.detectClickableByCursor) {
                const structural = new Set(elements);
                const byCursor = getVisibleElements(function(e, v) {
                    if (!structural.has(e) && isElementClickableByCursor(e)) {
                        v.push(e);
                    }
                });
                elements = elements.concat(byCursor);
            }
            elements = filterOverlapElements(elements);
        } else if (Array.isArray(cssSelector)) {
            elements = filterInvisibleElements(cssSelector);
        } else {
            elements = getVisibleElementsBySelector(cssSelector, function(e) {
                return !e.disabled && !e.readOnly;
            });
            elements = filterInvisibleElements(elements);
            elements = filterOverlapElements(elements);
        }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest tests/content_scripts/common/hints.test.js tests/content_scripts/common/utils.test.js`
Expected: PASS, all tests green.

- [ ] **Step 5: Run the full suite to check for regressions**

Run: `npx jest`
Expected: same 3 pre-existing failing suites as noted in Global Constraints, no new failures.

- [ ] **Step 6: Commit**

```bash
git add src/content_scripts/common/hints.js tests/content_scripts/common/hints.test.js
git commit -m "perf: drive click-hint discovery from querySelectorAll instead of a full-DOM scan"
```

---

### Task 5: Wire `createInputLayer` to the fast path

**Files:**
- Modify: `src/content_scripts/common/hints.js:921-939`
- Test: `tests/content_scripts/common/hints.test.js`

**Interfaces:**
- Consumes: `getVisibleElementsBySelector` (Task 3, already imported in Task 4).
- Produces: no new public interface — `self.createInputLayer()` keeps its existing signature/behavior.

- [ ] **Step 1: Write the failing test**

Add to `tests/content_scripts/common/hints.test.js`, inside the same `describe` block:

```js
    test('createInputLayer finds visible text inputs via the selector fast path', () => {
        document.body.innerHTML = '<input id="i1" type="text"><input id="i2" type="text"><input id="i3" type="checkbox">';

        hints.createInputLayer();

        const maskedIds = Array.from(document.querySelectorAll('mask')).map((m) => m.link.id);
        expect(maskedIds.sort()).toEqual(['i1', 'i2']);
    });
```

Note: `document.querySelectorAll('mask')` only finds masks if they were appended to light DOM — `createInputLayer` appends them to `hintsHost.shadowRoot`, so query through that instead. Use this corrected version:

```js
    test('createInputLayer finds visible text inputs via the selector fast path', () => {
        document.body.innerHTML = '<input id="i1" type="text"><input id="i2" type="text"><input id="i3" type="checkbox">';

        hints.createInputLayer();

        const host = document.querySelector('.surfingkeys_hints_host');
        const maskedIds = Array.from(host.shadowRoot.querySelectorAll('mask')).map((m) => m.link.id);
        expect(maskedIds.sort()).toEqual(['i1', 'i2']);
    });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/content_scripts/common/hints.test.js`
Expected: This test should already PASS today, since `createInputLayer` isn't changed yet and the old `getVisibleElements`-based scan already produces this result. Confirm it passes now (this locks in the behavior contract before refactoring) — if it fails for an unrelated reason (e.g. `host` is `null`), check that `_initHolder`/`placeHintsHost` ran (call `hints.createInputLayer()` only after `document.body.innerHTML` is set, as above), fix the test setup, and re-run before moving to Step 3.

- [ ] **Step 3: Implement**

Replace lines 921-939 in `src/content_scripts/common/hints.js`:

```js
    self.createInputLayer = function() {
        placeHintsHost(hintsHost);
        const cssSelector = getCssSelectorsOfEditable();

        var elements = getVisibleElements(function(e, v) {
            if (e.matches(cssSelector) && !e.disabled && !e.readOnly
                && (e.type === "text" || e.type === "email" || e.type === "search" || e.type === "password")) {
                v.push(e);
            }
        });

        if (elements.length === 0 && document.querySelector(cssSelector) !== null) {
            document.querySelector(cssSelector).scrollIntoView();
            elements = getVisibleElements(function(e, v) {
                if (e.matches(cssSelector) && !e.disabled && !e.readOnly) {
                    v.push(e);
                }
            });
        }
```

with:

```js
    self.createInputLayer = function() {
        placeHintsHost(hintsHost);
        const cssSelector = getCssSelectorsOfEditable();

        var elements = getVisibleElementsBySelector(cssSelector, function(e) {
            return !e.disabled && !e.readOnly
                && (e.type === "text" || e.type === "email" || e.type === "search" || e.type === "password");
        });

        if (elements.length === 0 && document.querySelector(cssSelector) !== null) {
            document.querySelector(cssSelector).scrollIntoView();
            elements = getVisibleElementsBySelector(cssSelector, function(e) {
                return !e.disabled && !e.readOnly;
            });
        }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest tests/content_scripts/common/hints.test.js`
Expected: PASS, all tests in this file green (the test from Step 1 still passes, now exercising the new code path).

- [ ] **Step 5: Run the full suite**

Run: `npx jest`
Expected: same 3 pre-existing failing suites as before, no new failures.

- [ ] **Step 6: Commit**

```bash
git add src/content_scripts/common/hints.js tests/content_scripts/common/hints.test.js
git commit -m "perf: drive input-layer hint discovery from querySelectorAll instead of a full-DOM scan"
```

---

### Task 6: Final verification

**Files:** none (verification only)

- [ ] **Step 1: Run the full test suite**

Run: `npx jest`
Expected: same pre-existing failures as documented in Global Constraints (`tests/background/start.test.js`, `tests/content_scripts/common/normal.test.js`, `tests/content_scripts/markdown.test.js`), all other suites green including the new `hints.test.js` and the expanded `utils.test.js`.

- [ ] **Step 2: Build the extension**

Run: `npx webpack --mode=development --config ./config/webpack.config.js`
Expected: `webpack ... compiled successfully` for both the content-script bundle and the secondary `api.js`/`pages` bundles, no new errors.

- [ ] **Step 3: Manual smoke test (load the unpacked extension)**

1. Open `chrome://extensions`, enable Developer Mode, "Load unpacked", select the `dist/` directory produced by the build in Step 2.
2. Visit a content-heavy page (e.g. Wikipedia or Hacker News) and press `f`. Confirm hints appear on links/buttons as before.
3. Find (or construct a small local HTML file with) a page that mixes real `<a>` links with a non-semantic clickable `<div style="cursor: pointer">`. Press `f` — by default the fast path already found the real links, so the automatic zero-results fallback does *not* trigger, and the cursor-styled div should be **missing** from the hints. Then set `runtime.conf.detectClickableByCursor = true` in the content script console and press `f` again — confirm the cursor-styled div now gets a hint too. Finally, test a page built entirely from non-semantic clickable divs (no real links/buttons at all) with the flag back at `false` — confirm hints still appear via the automatic fallback.
4. Press `gi` (insert-mode hints) on a page with multiple text inputs (e.g. a search form with several fields). Confirm input hints still appear correctly.

- [ ] **Step 4: Commit (if Step 3 surfaced any fixes)**

Only if manual testing required a fix:

```bash
git add -A
git commit -m "fix: <describe what manual testing caught>"
```
