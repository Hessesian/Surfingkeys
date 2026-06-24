# Scroll-Target and Mutation-Observer Fast-Path Design

## Problem

Two code paths in Surfingkeys perform full-document scans with per-node forced layout/style calls — the same anti-pattern fixed for click-hint detection on branch `perf/hint-detection-fast-path`, but worse, because one of them interleaves reads and writes (genuine layout thrashing) and the other re-triggers on every DOM mutation.

### 1. `Mode.getScrollableElements()` (`src/content_scripts/common/mode.js:209-223`)

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
    if (document.scrollingElement && (document.scrollingElement.scrollHeight > window.innerHeight
        || document.scrollingElement.scrollWidth > window.innerWidth)) {
        nodes.unshift(document.scrollingElement);
    }
    return nodes;
};
```

`listElements(root, whatToShow, filter)` (`utils.js:219-237`) uses a `NodeIterator` with no native filtering — it visits **every element in the document** and calls the JS `filter` callback per node. The filter here:

- `isElementDrawn(n)` (`utils.js:445-449`) — `getBoundingClientRect()` + `getComputedStyle(e).opacity`, per node.
- `Mode.hasScroll(n, ...)` (`mode.js:182-207`) — `getComputedStyle(el)` to check `overflowY`/`overflowX`; if (and only if) that's `auto`/`scroll`/`overlay`, it then **reads `el.scrollTop`, writes a probe value into it, reads again, and writes the original value back** to verify the element actually has scrollable content on some buggy sites (`mail.live.com` per the inline comment). This read-write-read sequence forces a synchronous layout recalculation, not just a style read.

This is called from `initScrollIndex()` (`normal.js:452-462`), which runs on `self.scroll()` (`normal.js:551`, bound to the default scroll keys) whenever `scrollNodes` is empty — i.e., on the **first scroll action on any page**. It is also called unconditionally, every time, from `changeScrollTarget()` (`normal.js:500-501`, the "cycle to next scrollable region" command) and `self.refreshScrollableElements()` (`normal.js:496-499`).

On a page with a huge, deeply-nested DOM (e.g. Figma's panel UI), this full walk — with a forced layout recalculation for every element that happens to have explicit `overflow: auto/scroll/overlay` — is expensive enough to freeze the tab, and it reruns on every "cycle scroll target" press, not just once.

### 2. `observer.js`'s modal-detection scan (`src/content_scripts/common/observer.js:18-70`)

```js
var DOMObserver = new MutationObserver(function (mutations) {
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
        // ...debounced 200ms...
        var possibleModalElements = getVisibleElements(function(e, v) {
            var br = e.getBoundingClientRect();
            if (br.width > 300 && br.height > 300 /* ...viewport bounds... */
                && Mode.hasScroll(e, 'y', 16)
                && isElementPositionRelative(e)
            ) {
                v.push(e);
            }
        });
        if (possibleModalElements.length) {
            normal.addScrollableElement(possibleModalElements[0]);
        }
    }
});
```

This observer is turned on after every hint click (`hints.js:399`, `dispatchSKEvent("observer", ['turnOn'])`) to catch newly-opened modals so they become the active scroll target, and turned off on disable/escape (`normal.js:642,1035,1049`). While active, **any** DOM mutation anywhere on the page (debounced 200ms) triggers `getVisibleElements()` — a full-document scan calling `getBoundingClientRect()` + `getComputedStyle(...).visibility` on every node — plus `isElementPositionRelative` (`observer.js:8-16`, walks every element up to `<body>` calling `getComputedStyle(elm).position` at each level) for every candidate that passes the size/scroll check.

On a DOM-churning SPA (Figma re-renders panels constantly), this refires every ~200ms for as long as the observer is on, each time re-scanning the whole document.

## Goal

Eliminate the full-document scan in both paths for the common case, using the same "fast targeted path, fall back to the existing full scan only when the fast path comes up empty" pattern already established and reviewed on the hint-detection branch — without changing either function's observable behavior in the case where the fast path succeeds (correctness must match; only the discovery mechanism changes).

## Design

### Fix 1: `Mode.getScrollableElements()` — ancestor-walk from viewport center

Modify `Mode.getScrollableElements()` in place — no new exported function, since no other caller needs a fast-only variant. The new body:

1. Finds the element at viewport center via `document.elementFromPoint(window.innerWidth / 2, window.innerHeight / 2)`.
2. Walks up the ancestor chain from that element to (not including) `document.body`, calling the *same* per-node predicate already used (`isElementDrawn(n) && (hasScroll-y-and-tall || hasScroll-x-and-wide)`) at each level, collecting matches in innermost-to-outermost order.
3. Appends `document.scrollingElement` at the front if it qualifies (same condition as today, lines 219-221) — actually current code unshifts it to the *front* unconditionally when it qualifies; the fast path must replicate this exactly so callers see the same node ordering they do today for the page-level scrollbar case.
4. If step 2 finds at least one scrollable ancestor (or step 3 added `document.scrollingElement`), return that list — no full scan needed.
5. If step 2 finds **nothing** and `document.scrollingElement` doesn't qualify either, fall back to the existing `listElements`-based full scan (today's implementation, unchanged) — covers pages where the viewport center isn't inside any scroll container worth surfacing, and preserves the "cycle through every scrollable region on the page" behavior for `changeScrollTarget` when the targeted approach can't find enough candidates.

This keeps `Mode.hasScroll` itself untouched (its short-circuit on `overflow` style already means the expensive scrollTop probe only runs for elements with explicit `overflow: auto/scroll/overlay`, which is correct and necessary for the buggy-site workaround) — the fix is purely about *how many elements* get tested, not changing the per-element test.

**Decision:** the ancestor walk starts from viewport-center only (`document.elementFromPoint(window.innerWidth / 2, window.innerHeight / 2)`), not `document.activeElement`. It's simple, dependency-free, and matches the common case (scrolling what's on screen). The full-scan fallback already covers the case where focus is somewhere the viewport-center walk doesn't reach, so there's no coverage gap — just a (rare, fallback-handled) extra full scan in that case. Out of scope for this round; revisit only if real-world testing shows this fallback triggering often enough to matter.

### Fix 2: `observer.js`'s modal-detection scan — scan added nodes, not the whole document

Replace the `getVisibleElements()` full-document call with a scan scoped to the mutation's own `addedNodes` (already collected) and their descendants:

```js
var possibleModalElements = [];
for (var added of addedNodes) {
    if (added.matches && added.width... /* same predicate */) {
        possibleModalElements.push(added);
    }
    // also check descendants of `added`, since the modal's scrollable
    // container might be nested a level or two inside the added node
    // rather than being the added node itself
    var descendants = added.querySelectorAll ? added.querySelectorAll('*') : [];
    for (var d of descendants) {
        if (/* same predicate */) possibleModalElements.push(d);
    }
}
```

This is correct because a newly-opened modal's scrollable container is necessarily either one of the nodes the mutation just added, or a descendant of one of them — it cannot be a pre-existing node elsewhere in the document (if it already existed and was already scrollable, the existing scroll-target machinery would already have found it). No fallback to a full scan is needed here, since the search space is already exactly right by construction — this isn't a heuristic narrowing like Fix 1, it's a correctness-preserving scope reduction.

`isElementPositionRelative` stays as-is (still needed per candidate), but now only runs against the (typically tiny) set of added nodes and their descendants instead of every visible element on the page.

## Testing approach

Jsdom unit tests, following the same pattern established on `perf/hint-detection-fast-path` (mocked `getBoundingClientRect`, `getComputedStyle` wrapper, `elementFromPoint` stub):

- `Mode.getScrollableElements` fast path: viewport-center element with a scrollable ancestor two levels up → returns `[ancestor]` without invoking the full-scan fallback (assert via a spy on the full-scan code path, or by structuring the implementation so the fallback is a separately-callable/testable function).
- `Mode.getScrollableElements` fallback: viewport-center element with no scrollable ancestors, but a scrollable element elsewhere in the document → falls back to the full scan and still finds it (regression test mirroring today's behavior).
- `document.scrollingElement` ordering: when the page itself is taller than the viewport, it's still unshifted to the front in both the fast-path and fallback cases.
- `observer.js`: a mutation adding a single large scrollable div → detected. A mutation adding a wrapper div containing the scrollable div as a child → still detected (descendant check). A mutation elsewhere on the page that doesn't add anything modal-shaped → no false positive, and (where feasible to assert) the pre-existing unrelated parts of the document are never queried.

## Out of scope

- Changing `Mode.hasScroll`'s internal probe logic (the read-write-read workaround for buggy sites) — untouched, still correct.
- Adding `document.activeElement` as an alternate starting point — deferred per the open question above.
- Any change to `getVisibleElements` itself, `isElementPositionRelative`'s per-node logic, or the 200ms debounce in `observer.js` — only the *candidate set* fed into these changes.
