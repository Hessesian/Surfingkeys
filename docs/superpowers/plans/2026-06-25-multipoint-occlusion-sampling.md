# Multi-Point Occlusion Sampling Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix a false-negative in `filterOverlapElements`'s occlusion check so full-card overlay links (e.g. Reddit's post-wrapper `<a>`) whose center point is visually covered by sibling content still get hinted, without weakening occlusion detection for genuinely-hidden elements.

**Architecture:** Replace the single center-point `elementFromPoint` test in `filterOverlapElements` (`src/content_scripts/common/utils.js`) with a 5-point sample (center + 4 inset corners): the element is occluded only if every sample point fails the existing ancestor/descendant relationship check. This is a strict loosening of the existing heuristic — it can only cause previously-filtered elements to now be kept, never the reverse.

**Tech Stack:** Plain JS (Webpack-bundled content script), Jest + jsdom for tests.

## Global Constraints

- Do not change `getRealRect`, `isElementDrawn`, `isExplicitlyRequested`, or `filterAncestors` — only the occlusion-check branch inside `filterOverlapElements` changes.
- Do not introduce any markup-pattern-specific detection (e.g. recognizing `position: absolute; inset: 0` specifically) — this is a general robustness improvement to the existing hit-testing heuristic.
- Do not increase the sample count beyond 5 (center + 4 corners) — keeps the per-candidate cost in the same order of magnitude as today's single check.
- Run `npx jest` after the task; all tests must stay green. The repo has 3 pre-existing failing suites (`tests/background/start.test.js`, `tests/content_scripts/common/normal.test.js`, `tests/content_scripts/markdown.test.js`) unrelated to this work — confirm failures don't change in count/names.
- Run `npx webpack --mode=development --config ./config/webpack.config.js` after the task to confirm the bundle still builds.
- This is a single, small, additive/loosening task — no branch/worktree isolation needed; work directly on `master` (current HEAD at plan-writing time: `4308e5b`), per the same explicit user consent already given for direct-master work on this repo.

---

### Task 1: Multi-point occlusion sampling in `filterOverlapElements`

**Files:**
- Modify: `src/content_scripts/common/utils.js:689-705`
- Test: `tests/content_scripts/common/utils.test.js`

**Interfaces:**
- Consumes: nothing new (uses the existing `getRealRect`, `isElementDrawn`, `isExplicitlyRequested`, `filterAncestors` already in `utils.js`).
- Produces: `isElementAtPoint(e, x, y)` and `isElementOccluded(e, be)` — new, non-exported, module-private helper functions in `utils.js`, placed immediately before `filterOverlapElements`. `filterOverlapElements(elements)` itself keeps its existing exported signature and return type (`Array<Element>`).

- [ ] **Step 1: Write the failing tests**

Add a new `describe` block to `tests/content_scripts/common/utils.test.js` (append at the end of the file, following the same pattern as the existing `describe('querySelectorAllDeep', ...)` and `describe('getVisibleElementsBySelector', ...)` blocks — each sets up its own `chrome`/`DOMRect` mocks in `beforeAll`):

```js
describe('filterOverlapElements occlusion sampling', () => {
    let filterOverlapElements;
    let realGetBoundingClientRect, realElementFromPoint;

    beforeAll(() => {
        global.chrome = {
            runtime: { sendMessage: jest.fn(), onMessage: { addListener: jest.fn() } },
            extension: { getURL: jest.fn() }
        };
        global.DOMRect = jest.fn();

        filterOverlapElements = require('src/content_scripts/common/utils.js').filterOverlapElements;

        realGetBoundingClientRect = Element.prototype.getBoundingClientRect;
        Element.prototype.getBoundingClientRect = function() {
            return this._rect || { top: 0, left: 0, width: 100, height: 100, bottom: 100, right: 100 };
        };

        realElementFromPoint = document.elementFromPoint;
    });

    afterAll(() => {
        Element.prototype.getBoundingClientRect = realGetBoundingClientRect;
        document.elementFromPoint = realElementFromPoint;
    });

    afterEach(() => {
        document.body.innerHTML = '';
    });

    function makeCandidate(rect) {
        const el = document.createElement('a');
        el.href = '#';
        el._rect = rect;
        document.body.appendChild(el);
        return el;
    }

    test('keeps a candidate whose center is occluded by a sibling but a corner is clear', () => {
        const candidate = makeCandidate({ top: 0, left: 0, width: 100, height: 100, bottom: 100, right: 100 });
        const sibling = document.createElement('div');
        sibling._rect = { top: 40, left: 40, width: 20, height: 20, bottom: 60, right: 60 };
        document.body.appendChild(sibling);

        document.elementFromPoint = function(x, y) {
            // Sibling covers only the 40-60 region (the center); corners (near 0,0 / 0,100 / 100,0 / 100,100) are clear.
            if (x >= 40 && x <= 60 && y >= 40 && y <= 60) {
                return sibling;
            }
            return candidate;
        };

        const result = filterOverlapElements([candidate]);

        expect(result).toEqual([candidate]);
    });

    test('filters out a candidate occluded at every sample point by the same covering element', () => {
        const candidate = makeCandidate({ top: 0, left: 0, width: 100, height: 100, bottom: 100, right: 100 });
        const cover = document.createElement('div');
        cover._rect = { top: 0, left: 0, width: 200, height: 200, bottom: 200, right: 200 };
        document.body.appendChild(cover);

        document.elementFromPoint = function() {
            return cover;
        };

        const result = filterOverlapElements([candidate]);

        expect(result).toEqual([]);
    });

    test('keeps a candidate with no occlusion at any point', () => {
        const candidate = makeCandidate({ top: 0, left: 0, width: 100, height: 100, bottom: 100, right: 100 });

        document.elementFromPoint = function() {
            return candidate;
        };

        const result = filterOverlapElements([candidate]);

        expect(result).toEqual([candidate]);
    });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest tests/content_scripts/common/utils.test.js`
Expected: the first test (`keeps a candidate whose center is occluded...`) FAILS — today's `filterOverlapElements` only tests the center point (`be.left + be.width/2, be.top + be.height/2` = `(50, 50)`), which the mock routes to `sibling` (since `50` is within `40-60` on both axes), so the relationship check (`!el || el.shadowRoot && ... || el.contains(e) || e.contains(el)`) is `false` for `sibling` (it's a plain div, no shadow root, doesn't contain and isn't contained by `candidate`), and the candidate is incorrectly dropped — `result` is `[]`, not `[candidate]`. The second and third tests should already PASS today (both only ever resolve to a single consistent answer regardless of how many points are sampled), confirming they're valid baseline/regression tests rather than red herrings.

- [ ] **Step 3: Implement**

In `src/content_scripts/common/utils.js`, replace lines 689-705:

```js
function filterOverlapElements(elements) {
    // filter out tiny elements
    elements = elements.filter(function(e) {
        var be = getRealRect(e);
        if (e.disabled || e.readOnly || !isElementDrawn(e, be)) {
            return false;
        } else if (e.matches("input, textarea, select, form")
            || e.contentEditable === "true" || isExplicitlyRequested(e)) {
            return true;
        } else {
            var el = e.getRootNode().elementFromPoint(be.left + be.width/2, be.top + be.height/2);
            return !el || el.shadowRoot && (el.childElementCount === 0 || el.shadowRoot.contains(e)) || el.contains(e) || e.contains(el);
        }
    });

    return filterAncestors(elements);
}
```

with:

```js
function isElementAtPoint(e, x, y) {
    var el = e.getRootNode().elementFromPoint(x, y);
    return !el || el.shadowRoot && (el.childElementCount === 0 || el.shadowRoot.contains(e)) || el.contains(e) || e.contains(el);
}

/**
 * Test whether `e` is occluded by something else at every one of 5 sample
 * points (center + 4 inset corners) of its rect `be`. A single center-point
 * test (the old behavior) misses large "overlay" elements — e.g. a
 * full-card `<a>` whose visible content is a sibling layer drawn on top of
 * its center — that are still the real clickable target across most of
 * their area. Sampling the corners too means the element is only
 * considered occluded if nothing of it is clickable anywhere.
 *
 * @param {Element} e
 * @param {DOMRect} be
 * @returns {boolean}
 */
function isElementOccluded(e, be) {
    var inset = 2; // px, avoid landing exactly on a shared border with a neighboring element
    var points = [
        [be.left + be.width / 2, be.top + be.height / 2], // center
        [be.left + inset, be.top + inset],                 // top-left
        [be.right - inset, be.top + inset],                // top-right
        [be.left + inset, be.bottom - inset],               // bottom-left
        [be.right - inset, be.bottom - inset],              // bottom-right
    ];
    return !points.some(function(p) {
        return isElementAtPoint(e, p[0], p[1]);
    });
}

function filterOverlapElements(elements) {
    // filter out tiny elements
    elements = elements.filter(function(e) {
        var be = getRealRect(e);
        if (e.disabled || e.readOnly || !isElementDrawn(e, be)) {
            return false;
        } else if (e.matches("input, textarea, select, form")
            || e.contentEditable === "true" || isExplicitlyRequested(e)) {
            return true;
        } else {
            return !isElementOccluded(e, be);
        }
    });

    return filterAncestors(elements);
}
```

`isElementAtPoint` and `isElementOccluded` are plain `function` declarations — do NOT add them to the `export { ... }` block at the bottom of the file; only `filterOverlapElements` (already exported) needs to remain exported.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest tests/content_scripts/common/utils.test.js`
Expected: PASS, all tests in this file green, including the 3 new tests and every pre-existing test in this file (`utils performance`, `querySelectorAllDeep`, `getVisibleElementsBySelector` describe blocks).

- [ ] **Step 5: Run the full suite to check for regressions**

Run: `npx jest`
Expected: same 3 pre-existing failing suites as noted in Global Constraints, no new failures. Pay particular attention to `tests/content_scripts/common/hints.test.js` — it indirectly exercises `filterOverlapElements` through `createHintsForClick`, but stubs `elementFromPoint` to always return `null`, so `isElementAtPoint` will return `true` (`!el` is `true`) at every sample point regardless of count, meaning `isElementOccluded` returns `false` for every candidate in those tests — identical behavior to today, just evaluated 5 times instead of once. No change expected there.

- [ ] **Step 6: Build the extension**

Run: `npx webpack --mode=development --config ./config/webpack.config.js`
Expected: `webpack ... compiled successfully`, no new errors.

- [ ] **Step 7: Commit**

```bash
git add src/content_scripts/common/utils.js tests/content_scripts/common/utils.test.js
git commit -m "fix: sample 5 points instead of 1 when checking hint candidates for occlusion"
```

---

### Task 2: Manual verification

**Files:** none (verification only)

- [ ] **Step 1: Rebuild and reload**

Run: `npx webpack --mode=development --config ./config/webpack.config.js` (if not already current from Task 1, Step 6).
In the browser where the unpacked extension from `dist/development/chrome` is loaded, click the reload icon on the extension's card (in `chrome://extensions` or `vivaldi://extensions`), then refresh any already-open test tabs (extension reloads invalidate the content-script context on already-loaded pages — refreshing the tab is required, not just reloading the extension).

- [ ] **Step 2: Verify the Reddit case is fixed**

On a Reddit post listing where a post's title link previously didn't get a hint on `f`, press `f` again. Confirm the post-wrapper `<a>` now gets a hint.

- [ ] **Step 3: Verify no obvious new false positives**

On a page with a modal dialog or dropdown open (something with real, intentionally-hidden content behind it), press `f`. Confirm elements that are genuinely fully covered by the modal/dropdown still do NOT get hints.

- [ ] **Step 4: Commit (if Step 2 or 3 surfaced any fixes)**

Only if manual testing required a fix:

```bash
git add -A
git commit -m "fix: <describe what manual testing caught>"
```
