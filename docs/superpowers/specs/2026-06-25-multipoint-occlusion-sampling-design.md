# Multi-Point Occlusion Sampling Design

## Problem

`filterOverlapElements` in `src/content_scripts/common/utils.js` decides whether a hint candidate is "occluded" (and should be dropped) by testing a single point — the center of its bounding rect — via `elementFromPoint`. If something else renders on top of that exact pixel and isn't an ancestor/descendant of the candidate, the candidate is filtered out as occluded.

This breaks down for a common modern markup pattern: a full-card "overlay" link (`<a>` with e.g. `class="absolute inset-0"`, covering an entire post/card container) where the visually-rendered content (title text, thumbnail) is a *separate sibling* layer drawn on top of part of the card, not a DOM descendant of the link. Reddit's post listings use exactly this pattern. When the card's visible content happens to sit at the geometric center of the card, the center-point test hits that sibling content instead of the overlay link, and the link — which is the actual clickable target across most of the card's area — gets incorrectly dropped.

## Goal

Make the occlusion check more robust to partial coverage without weakening it for genuinely-occluded elements (e.g. something fully hidden behind a modal backdrop), and without introducing markup-pattern-specific special-casing.

## Design

Sample 5 points instead of 1: the center, plus the 4 corners of the candidate's rect, each inset 2px so they don't land exactly on a border shared with a neighboring element. The candidate is occluded only if **every** sample point's hit-test fails the existing relationship check (the point's topmost element is neither the candidate nor an ancestor/descendant of it).

### Implementation shape

Extract the existing single-point check into a named helper, then call it from a new multi-point function:

```js
function isElementAtPoint(e, x, y) {
    var el = e.getRootNode().elementFromPoint(x, y);
    return !el || el.shadowRoot && (el.childElementCount === 0 || el.shadowRoot.contains(e)) || el.contains(e) || e.contains(el);
}

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
```

`filterOverlapElements`'s `else` branch (currently the inline `elementFromPoint` call and relationship check) becomes:

```js
        } else {
            return !isElementOccluded(e, be);
        }
```

Nothing else in `filterOverlapElements` changes — the `disabled`/`readOnly`/`isElementDrawn` short-circuit, the `input/textarea/select/form`/`contentEditable`/`isExplicitlyRequested` early-true branch, and the trailing `filterAncestors(elements)` call all stay exactly as they are.

### Why this is safe

The new check is a strict loosening: an element occluded at every one of the 5 points is necessarily also occluded at the center (since center is one of the 5 points), so anything the old code kept, the new code still keeps. The only behavior change is that some elements the old code dropped (occluded at center, but not at every point) are now kept. This means the change can only ever cause a previously-filtered element to start appearing as a hint candidate — it cannot cause a previously-kept element to be dropped, and it cannot affect any candidate that isn't a real DOM element with at least one of its 5 sample points clear.

### Blast radius

`filterOverlapElements` is called from:
- `createHintsForClick`'s `cssSelector === ""` branch (the default `f`/`F` click-hints path) — `src/content_scripts/common/hints.js`.
- `createHintsForClick`'s explicit-string-selector branch (used by mappings like `yA`, "copy a link URL to the clipboard").
- `getClickableElements` in `utils.js` (used for previous/next-page link detection, and `Hints.click(selectorString, ...)`).

All three only ever *consume* the filtered list as candidates to hint or click — none of them depend on the *exact* false-negative behavior being fixed here, so loosening the filter is safe for all three call sites under the "strict loosening" argument above.

## Testing approach

New tests in `tests/content_scripts/common/utils.test.js` (where `filterOverlapElements` already lives, currently with zero direct test coverage of its occlusion logic — the only place it's indirectly exercised today, `hints.test.js`, stubs `elementFromPoint` to always return `null`, which only ever exercises the trivial "nothing is on top" branch).

Tests use a `document.elementFromPoint` mock that returns different elements depending on the queried coordinates (a small per-test mapping of rect regions to elements), rather than the existing always-null stub:

1. **Center occluded, a corner clear → kept.** A full-card overlay `<a>` with a sibling `<div>` covering only the center region of its rect. `filterOverlapElements([a])` must return `[a]` — the regression test pinning the actual bug being fixed.
2. **All 5 points occluded by the same covering element → filtered out.** A candidate fully covered by a larger sibling element at every sample point. `filterOverlapElements([candidate])` must return `[]` — proving the fix doesn't weaken genuine occlusion detection.
3. **No occlusion at any point → kept.** A baseline candidate where `elementFromPoint` returns the candidate itself at every point. `filterOverlapElements([candidate])` must return `[candidate]` — sanity check, since no test currently establishes this baseline either.

## Out of scope

- Any change to `getRealRect`, `isElementDrawn`, `isExplicitlyRequested`, or `filterAncestors` — only the occlusion-check branch of `filterOverlapElements` changes.
- Any markup-pattern-specific detection (e.g. recognizing `position: absolute; inset: 0` overlays specifically) — this is a general robustness improvement to the existing hit-testing heuristic, not a special case for Reddit's particular markup.
- Increasing the sample count beyond 5 (e.g. a denser grid) — center + 4 corners is the standard "good enough" shape for this kind of test and keeps the per-candidate cost in the same order of magnitude as today's single check.
