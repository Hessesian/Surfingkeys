# Scroll-Target and Mutation-Observer Fast-Path Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate the full-document scans in `Mode.getScrollableElements()` and `observer.js`'s modal-detection callback — both fire far more often than the hint-detection scan this branch already fixed, and on DOM-heavy SPAs (e.g. Figma) they can freeze the tab.

**Architecture:** `Mode.getScrollableElements()` gets a fast path that walks up the ancestor chain from the element at viewport center, testing only that chain instead of every element in the document; it falls back to the existing full scan only when that chain has no scrollable ancestor. `observer.js`'s mutation callback already has the exact set of newly-added nodes available from the `MutationRecord` — it scans only those nodes and their descendants instead of the whole document, with no fallback needed since the modal it's hunting for is, by construction, always among the nodes that were just added.

**Tech Stack:** Plain JS (Webpack-bundled content script), Jest + jsdom for tests.

## Global Constraints

- Continue on the existing branch `perf/hint-detection-fast-path` — do not create a new branch or worktree.
- Do not change `Mode.hasScroll`'s internal probe logic (the read-write-read workaround for buggy sites like `mail.live.com`) — it stays exactly as-is; only the *number of elements* it gets called on changes.
- Do not change `isElementPositionRelative`'s per-node logic, the 200ms debounce in `observer.js`, or `getVisibleElements` itself — only the candidate set fed into them.
- jsdom does not implement `document.elementFromPoint` and defaults `getComputedStyle(el).opacity` to `""` instead of `"1"` — both task's tests need the same harness workarounds already established and reviewed on this branch's `tests/content_scripts/common/hints.test.js` (a `getComputedStyle` wrapper that patches empty `opacity` to `"1"` while leaving every other property — notably `overflowY`/`overflowX`/`position`, which jsdom computes correctly from inline styles — untouched; stubbing `document.elementFromPoint` directly since it doesn't exist in jsdom at all, rather than patching it conditionally).
- Run `npx jest` after every task; all tests must stay green. The repo currently has 3 pre-existing failing suites (`tests/background/start.test.js`, `tests/content_scripts/common/normal.test.js`, `tests/content_scripts/markdown.test.js`) unrelated to this work — confirm failures don't change in count/names before/after each task.
- Run `npx webpack --mode=development --config ./config/webpack.config.js` after the final task to confirm the bundle still builds.

---

### Task 1: Fast path for `Mode.getScrollableElements()`

**Files:**
- Modify: `src/content_scripts/common/mode.js:209-224`
- Test: `tests/content_scripts/common/mode.test.js` (new file)

**Interfaces:**
- Consumes: `listElements`, `isElementDrawn` (existing imports in `mode.js`).
- Produces: `Mode.getScrollableElements()` keeps its existing signature and return type (`Array<Element>`, scrollable elements/containers ordered innermost-first with `document.scrollingElement` unshifted to the front when it qualifies) — no new exported names.

- [ ] **Step 1: Write the failing tests**

Create `tests/content_scripts/common/mode.test.js`:

```js
describe('Mode.getScrollableElements fast path', () => {
    let Mode;
    let realGetBoundingClientRect, realElementFromPoint, realGetComputedStyle;

    beforeAll(() => {
        global.chrome = {
            runtime: {
                sendMessage: jest.fn(),
                onMessage: { addListener: jest.fn() }
            },
            extension: { getURL: jest.fn() }
        };
        global.DOMRect = jest.fn();

        Mode = require('src/content_scripts/common/mode.js').default;

        realGetBoundingClientRect = Element.prototype.getBoundingClientRect;
        Element.prototype.getBoundingClientRect = function() {
            return { top: 0, left: 0, width: 100, height: 100, bottom: 100, right: 100 };
        };

        realGetComputedStyle = window.getComputedStyle;
        window.getComputedStyle = function(elm) {
            const style = realGetComputedStyle(elm);
            if (style.opacity === '') {
                return new Proxy(style, {
                    get(target, prop) {
                        return prop === 'opacity' ? '1' : target[prop];
                    }
                });
            }
            return style;
        };

        realElementFromPoint = document.elementFromPoint;
    });

    afterAll(() => {
        Element.prototype.getBoundingClientRect = realGetBoundingClientRect;
        window.getComputedStyle = realGetComputedStyle;
        document.elementFromPoint = realElementFromPoint;
    });

    afterEach(() => {
        document.body.innerHTML = '';
    });

    function makeScrollableDiv(id, scrollHeight) {
        const div = document.createElement('div');
        div.id = id;
        div.style.overflowY = 'scroll';
        Object.defineProperty(div, 'scrollHeight', { value: scrollHeight, configurable: true });
        Object.defineProperty(div, 'scrollTop', { value: 16, writable: true, configurable: true });
        return div;
    }

    test('finds a scrollable ancestor of the viewport-center element without a full scan', () => {
        const outer = document.createElement('div');
        const scrollable = makeScrollableDiv('panel', 1000);
        const inner = document.createElement('span');
        scrollable.appendChild(inner);
        outer.appendChild(scrollable);
        document.body.appendChild(outer);

        document.elementFromPoint = () => inner;

        const result = Mode.getScrollableElements();

        expect(result).toEqual([scrollable]);
    });

    test('falls back to a full-document scan when the viewport-center chain has no scrollable ancestor', () => {
        const centerEl = document.createElement('div');
        document.body.appendChild(centerEl);

        const elsewhere = makeScrollableDiv('elsewhere-panel', 1000);
        document.body.appendChild(elsewhere);

        document.elementFromPoint = () => centerEl;

        const result = Mode.getScrollableElements();

        expect(result).toEqual([elsewhere]);
    });

    test('still places document.scrollingElement first when the page itself scrolls', () => {
        const scrollable = makeScrollableDiv('panel', 1000);
        document.body.appendChild(scrollable);
        document.elementFromPoint = () => scrollable;

        const realScrollingElementDesc = Object.getOwnPropertyDescriptor(Document.prototype, 'scrollingElement');
        const fakeScrollingElement = { scrollHeight: 5000, scrollWidth: 0 };
        Object.defineProperty(document, 'scrollingElement', {
            value: fakeScrollingElement,
            configurable: true
        });

        const result = Mode.getScrollableElements();

        expect(result[0]).toBe(fakeScrollingElement);
        expect(result).toContain(scrollable);

        delete document.scrollingElement;
        if (realScrollingElementDesc) {
            Object.defineProperty(Document.prototype, 'scrollingElement', realScrollingElementDesc);
        }
    });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest tests/content_scripts/common/mode.test.js`
Expected: the first test (ancestor-chain fast path) FAILS — today's `Mode.getScrollableElements()` ignores `document.elementFromPoint` entirely and always does the full scan, which (with `listElements` walking from `document.body`) would actually still find `scrollable` via the full scan today, so this specific test might pass already by coincidence of the full scan finding the same element. If it passes, that's fine — the second and third tests are the ones that exercise the fallback/scrollingElement-ordering contract and should already pass too, since they describe *today's* full-scan behavior. The real signal you need before implementing: temporarily add `console.log` or a spy confirming `document.elementFromPoint` is never read by the current implementation — if all three tests pass before you've changed anything, that's expected (these are characterization tests pinning the existing full-scan behavior's *observable results*, the same approach used for `createInputLayer` in the hint-detection plan), not a sign something is wrong. Proceed to Step 3 regardless.

- [ ] **Step 3: Implement**

Replace `src/content_scripts/common/mode.js:209-224`:

```js
Mode.getScrollableElements = function () {
    var nodes = listElements(document.body, NodeFilter.SHOW_ELEMENT, function(n) {
        return isElementDrawn(n) && ((Mode.hasScroll(n, 'y', 16) && n.scrollHeight > 200 ) || (Mode.hasScroll(n, 'x', 16) && n.scrollWidth > 200));
    });
    nodes.sort(function(a, b) {
        if (b.contains(a)) return 1;
        else if (a.contains(b)) return -1;
        return b.scrollHeight * b.scrollWidth - a.scrollHeight * a.scrollWidth;
    });
    // document.scrollingElement will be null when document.body.tagName === "FRAMESET", for example http://www.knoppix.org/
    if (document.scrollingElement && (document.scrollingElement.scrollHeight > window.innerHeight
        || document.scrollingElement.scrollWidth > window.innerWidth)) {
        nodes.unshift(document.scrollingElement);
    }
    return nodes;
};
```

with:

```js
function isScrollableContainer(n) {
    return isElementDrawn(n) && ((Mode.hasScroll(n, 'y', 16) && n.scrollHeight > 200) || (Mode.hasScroll(n, 'x', 16) && n.scrollWidth > 200));
}

function getScrollableElementsByFullScan() {
    var nodes = listElements(document.body, NodeFilter.SHOW_ELEMENT, isScrollableContainer);
    nodes.sort(function(a, b) {
        if (b.contains(a)) return 1;
        else if (a.contains(b)) return -1;
        return b.scrollHeight * b.scrollWidth - a.scrollHeight * a.scrollWidth;
    });
    return nodes;
}

Mode.getScrollableElements = function () {
    var nodes = [];
    var node = document.elementFromPoint(window.innerWidth / 2, window.innerHeight / 2);
    while (node) {
        if (isScrollableContainer(node)) {
            nodes.push(node);
        }
        if (node === document.body) {
            break;
        }
        node = node.parentElement;
    }

    if (nodes.length === 0) {
        nodes = getScrollableElementsByFullScan();
    }

    // document.scrollingElement will be null when document.body.tagName === "FRAMESET", for example http://www.knoppix.org/
    if (document.scrollingElement && (document.scrollingElement.scrollHeight > window.innerHeight
        || document.scrollingElement.scrollWidth > window.innerWidth)) {
        nodes.unshift(document.scrollingElement);
    }
    return nodes;
};
```

Note both `isScrollableContainer` and `getScrollableElementsByFullScan` are new module-level (private, non-exported) helper functions in `mode.js`, placed immediately before `Mode.getScrollableElements`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest tests/content_scripts/common/mode.test.js`
Expected: PASS, all 3 tests green. If the third test (`document.scrollingElement` override) fails because jsdom's `Document.prototype.scrollingElement` cannot be overridden the way the test attempts, that is a jsdom harness limitation, not a production-code bug — fix only the test's override mechanism (not its assertion intent: `document.scrollingElement` must still be unshifted to the front) the same way Task 4 on this branch fixed jsdom harness gaps for `hints.test.js`, and note the deviation in your report.

- [ ] **Step 5: Run the full suite to check for regressions**

Run: `npx jest`
Expected: same 3 pre-existing failing suites as noted in Global Constraints, no new failures.

- [ ] **Step 6: Commit**

```bash
git add src/content_scripts/common/mode.js tests/content_scripts/common/mode.test.js
git commit -m "perf: find scroll target via ancestor walk instead of a full-DOM scan"
```

---

### Task 2: Scope `observer.js`'s modal-detection scan to added nodes

**Files:**
- Modify: `src/content_scripts/common/observer.js`
- Test: `tests/content_scripts/common/observer.test.js` (new file)

**Interfaces:**
- Consumes: `Mode.hasScroll` (existing import, unchanged).
- Produces: `startScrollNodeObserver(normal)` keeps its existing signature and behavior (calls `normal.addScrollableElement(elm)` exactly once per qualifying mutation burst, on the first matching candidate) — no new exported names.

- [ ] **Step 1: Write the failing tests**

Create `tests/content_scripts/common/observer.test.js`:

```js
describe('observer modal detection', () => {
    let startScrollNodeObserver, normal;
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

        startScrollNodeObserver = require('src/content_scripts/common/observer.js').default;

        realGetBoundingClientRect = Element.prototype.getBoundingClientRect;
        Element.prototype.getBoundingClientRect = function() {
            return { top: 0, left: 0, width: 400, height: 400, bottom: 400, right: 400 };
        };
    });

    afterAll(() => {
        Element.prototype.getBoundingClientRect = realGetBoundingClientRect;
    });

    beforeEach(() => {
        document.body.innerHTML = '';
        normal = { addScrollableElement: jest.fn() };
        startScrollNodeObserver(normal);
        document.dispatchEvent(new CustomEvent('surfingkeys:observer', { detail: ['turnOn'] }));
    });

    afterEach(() => {
        document.dispatchEvent(new CustomEvent('surfingkeys:observer', { detail: ['turnOff'] }));
    });

    function makeModalDiv(id) {
        const div = document.createElement('div');
        div.id = id;
        div.style.position = 'relative';
        div.style.overflowY = 'scroll';
        Object.defineProperty(div, 'scrollTop', { value: 16, writable: true, configurable: true });
        return div;
    }

    test('detects a directly-added scrollable modal-like element', async () => {
        const modal = makeModalDiv('modal');
        document.body.appendChild(modal);

        await new Promise((r) => setTimeout(r, 250));

        expect(normal.addScrollableElement).toHaveBeenCalledWith(modal);
    });

    test('detects a scrollable modal nested inside an added wrapper', async () => {
        const wrapper = document.createElement('div');
        const modal = makeModalDiv('nested-modal');
        wrapper.appendChild(modal);
        document.body.appendChild(wrapper);

        await new Promise((r) => setTimeout(r, 250));

        expect(normal.addScrollableElement).toHaveBeenCalledWith(modal);
    });

    test('does not call addScrollableElement for a small added element', async () => {
        const small = document.createElement('div');
        small.style.position = 'relative';
        small.getBoundingClientRect = () => ({ top: 0, left: 0, width: 10, height: 10, bottom: 10, right: 10 });
        document.body.appendChild(small);

        await new Promise((r) => setTimeout(r, 250));

        expect(normal.addScrollableElement).not.toHaveBeenCalled();
    });

    test('does not call addScrollableElement when nothing is added', async () => {
        await new Promise((r) => setTimeout(r, 250));

        expect(normal.addScrollableElement).not.toHaveBeenCalled();
    });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest tests/content_scripts/common/observer.test.js`
Expected: the first two tests (direct and nested modal detection) should already PASS today, since today's full-document `getVisibleElements()` scan would also find these elements (they're the only candidates on the page) — these are characterization tests pinning today's observable behavior, the same approach used elsewhere on this branch for behavior-preserving refactors. The third and fourth tests (no false positives) should also already pass today. If any of these 4 tests fails for a reason other than a jsdom environment gap (e.g. `getComputedStyle` not reflecting `overflowY`/`position` from inline styles, or `MutationObserver` not firing in this jsdom version), treat that as a real finding — stop and report it rather than guessing at a fix, since it would mean the test environment can't validate this change at all.

- [ ] **Step 3: Implement**

Replace `src/content_scripts/common/observer.js` in full:

```js
import {
    initSKFunctionListener,
} from './utils.js';

import Mode from './mode';

function isElementPositionRelative(elm) {
    while (elm !== document.body) {
        if (getComputedStyle(elm).position === "relative") {
            return true;
        }
        elm = elm.parentElement;
    }
    return false;
}

function isPossibleModalElement(e) {
    var br = e.getBoundingClientRect();
    return br.height > 0
        && getComputedStyle(e).visibility !== 'hidden'
        && br.width > 300 && br.height > 300
        && br.width <= window.innerWidth && br.height <= window.innerHeight
        && br.top >= 0 && br.left >= 0
        && Mode.hasScroll(e, 'y', 16)
        && isElementPositionRelative(e);
}

function findPossibleModalElements(addedNodes) {
    var possibleModalElements = [];
    for (var added of addedNodes) {
        if (isPossibleModalElement(added)) {
            possibleModalElements.push(added);
        }
        var descendants = added.querySelectorAll('*');
        for (var i = 0; i < descendants.length; i++) {
            if (isPossibleModalElement(descendants[i])) {
                possibleModalElements.push(descendants[i]);
            }
        }
    }
    return possibleModalElements;
}

function startScrollNodeObserver(normal) {
    var pendingUpdater = undefined, DOMObserver = new MutationObserver(function (mutations) {
        var addedNodes = [];
        for (var m of mutations) {
            for (var n of m.addedNodes) {
                if (n.nodeType === Node.ELEMENT_NODE && !n.fromSurfingKeys) {
                    n.newlyCreated = true;
                    addedNodes.push(n);
                }
            }
        }

        if (addedNodes.length) {
            if (pendingUpdater) {
                clearTimeout(pendingUpdater);
                pendingUpdater = undefined;
            }
            pendingUpdater = setTimeout(function() {
                var possibleModalElements = findPossibleModalElements(addedNodes);

                if (possibleModalElements.length) {
                    normal.addScrollableElement(possibleModalElements[0]);
                }
            }, 200);
        }
    });
    DOMObserver.isConnected = false;

    initSKFunctionListener("observer", {
        turnOn: () => {
            if (!DOMObserver.isConnected) {
                DOMObserver.observe(document, { childList: true, subtree:true });
                DOMObserver.isConnected = true;
            }
        },
        turnOff: () => {
            if (DOMObserver.isConnected) {
                DOMObserver.disconnect();
                DOMObserver.isConnected = false;
            }
        },
    });
}

export default startScrollNodeObserver;
```

Note `getVisibleElements` is no longer imported (it's been replaced by the targeted `findPossibleModalElements`); the import block at the top drops it accordingly.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest tests/content_scripts/common/observer.test.js`
Expected: PASS, all 4 tests green.

- [ ] **Step 5: Run the full suite to check for regressions**

Run: `npx jest`
Expected: same 3 pre-existing failing suites as noted in Global Constraints, no new failures.

- [ ] **Step 6: Commit**

```bash
git add src/content_scripts/common/observer.js tests/content_scripts/common/observer.test.js
git commit -m "perf: scope modal-detection scan to mutation-added nodes instead of the full document"
```

---

### Task 3: Final verification

**Files:** none (verification only)

- [ ] **Step 1: Run the full test suite**

Run: `npx jest`
Expected: same pre-existing failures as documented in Global Constraints (`tests/background/start.test.js`, `tests/content_scripts/common/normal.test.js`, `tests/content_scripts/markdown.test.js`), all other suites green including the new `mode.test.js` and `observer.test.js`.

- [ ] **Step 2: Build the extension**

Run: `npx webpack --mode=development --config ./config/webpack.config.js`
Expected: `webpack ... compiled successfully` for both the content-script bundle and the secondary bundles, no new errors.

- [ ] **Step 3: Manual smoke test (load the unpacked extension)**

1. Build output is at `dist/development/chrome` (already produced by Step 2). Load it unpacked via `chrome://extensions` or `vivaldi://extensions` (Developer Mode → Load unpacked) if not already loaded from the previous round of testing.
2. On a normal content page, press `j`/`k` to scroll — confirm scrolling still works, and pressing the "next scroll target" key (default `gs` per Surfingkeys' standard bindings — check the extension's key-binding help if unsure) still cycles between nested scrollable regions on a page that has them (e.g. a page with a scrollable sidebar and a scrollable main content area).
3. On Figma (the site that originally triggered this investigation): load the page, then try scrolling (`j`/`k`) and using hints (`f`) — confirm the tab no longer freezes.
4. Open a site with a JS-driven modal/lightbox (e.g. clicking a "Sign in" button that opens a scrollable modal dialog) after using `f` to click into it — confirm the modal becomes the active scroll target (this exercises the `observer.js` path end-to-end).

- [ ] **Step 4: Commit (if Step 3 surfaced any fixes)**

Only if manual testing required a fix:

```bash
git add -A
git commit -m "fix: <describe what manual testing caught>"
```
