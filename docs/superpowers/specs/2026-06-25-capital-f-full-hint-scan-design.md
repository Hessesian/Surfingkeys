# `F` — Explicit Full-Coverage Hint Scan Design

## Problem

The hint-detection fast-path branch (merged to `master`) made `f`'s default behavior skip the expensive "find elements styled `cursor: pointer` but not semantically marked up" scan unless the fast structural pass finds zero results. This is correct for the common case (Figma-style huge DOMs with no semantic markup at all), but on a "mixed" page — one with plenty of structural clickable elements (links, buttons) *and* some non-semantic clickable divs (e.g. a Reddit post's clickable wrapper div, or a clickable background `<div>`) — the structural pass finds non-zero results immediately, so the zero-results fallback never triggers, and those non-semantic elements never get hints by default.

The existing mitigation, `runtime.conf.detectClickableByCursor`, is a persistent per-installation (or per-site, via Surfingkeys' settings snippets) config flag. It works, but requires the user to know about it and configure it in advance.

## Goal

Give the user a way to get full hint coverage (including non-semantic, cursor-styled clickable elements) on demand, on any page, with no prior configuration — at the cost of that one keypress being slower on large pages, which is an acceptable, fully-informed tradeoff since the user is explicitly asking for the more thorough search.

## Design

Add a new default keybinding, `F` (capital), alongside the existing `f`.

- `f` keeps its exact current behavior (`src/content_scripts/common/default.js`, unchanged): fast structural pass, falling back to the cursor-heuristic scan only on zero results or when `runtime.conf.detectClickableByCursor` is set.
- `F` runs the same fast structural pass first (so structural elements still appear immediately, unchanged), but *always* additionally runs the cursor-heuristic scan, regardless of how many structural elements were found.

### Implementation shape

`createHintsForClick`'s gating condition in `src/content_scripts/common/hints.js` (currently `elements.length === 0 || runtime.conf.detectClickableByCursor`) gains a third OR'd condition: `|| behaviours.forceDetectByCursor`. `behaviours` is the existing per-call state object that `createHintsForClick` already populates from `attrs` (the `self.create(cssSelector, onHintKey, attrs)` parameter) before this gating check runs — so no new plumbing is needed beyond passing the new attrs key through.

The new mapping in `src/content_scripts/common/default.js`, placed immediately after the existing `f` mapping:

```js
mapkey("F", '#1Open a link including non-semantic clickable elements (slower full scan)', function() {
    hints.create("", hints.dispatchMouseClick, {forceDetectByCursor: true});
}, {repeatIgnore: true});
```

`runtime.conf.detectClickableByCursor` is unchanged and untouched — it remains available for users who want the cursor-heuristic scan to run on every `f` press on a given site, without needing to know about `F`. `F` is a complementary, no-configuration-needed alternative, not a replacement.

## Testing approach

Extend the existing `tests/content_scripts/common/hints.test.js` (created on the merged branch, with its established jsdom harness — `getBoundingClientRect`/`getComputedStyle` mocks, `Mode`/`insert`/`normal` factories) with one new test: a mixed-page scenario (some structural links + a non-semantic cursor-styled div) where `hints.create("", fn, {})` finds only the structural elements (today's behavior, already covered) and `hints.create("", fn, {forceDetectByCursor: true})` finds both — proving the new attrs flag actually bypasses the zero-results gate.

No test is needed for the `default.js` mapping itself beyond confirming it calls `hints.create` with the right arguments — `default.js`'s existing mappings aren't otherwise unit-tested in this codebase (verified: no `default.test.js` exists), so this follows established project convention rather than introducing new test scope.

## Out of scope

- Any change to `runtime.conf.detectClickableByCursor`'s existing behavior or default.
- Any async/idle-scheduled background sweep (considered and rejected during brainstorming: a single deferred full scan would still block the main thread for its full duration whenever it actually runs, reintroducing the Figma-style freeze this branch fixed, just shifted to shortly after page load; a properly chunked incremental sweep would solve that but adds significant complexity — `F` sidesteps the whole problem since the cost only ever occurs synchronously in response to an explicit, fully-informed user action).
- Per-site settings UI changes — `F` requires no settings at all, which was the explicit motivation for choosing it over the persistent-flag-only approach.
