# Surfingkeys TS

A fork of [brookhong/Surfingkeys](https://github.com/brookhong/Surfingkeys), the browser extension
for keyboard-driven, vim-style browsing. This README lists only what this fork changes. For
everything else (settings, the `api.*` reference, modes, omnibar, proxy, sessions, the LLM chat),
read the [upstream README](https://github.com/brookhong/Surfingkeys#readme): it all still applies.

What the fork does:

- **Keybindings closer to vim and qutebrowser.**
- **Editing that works in rich editors.** Teams, Reddit, and other CKEditor/Lexical/Slate pages.
- **Faster hints** on large pages.
- **A rewrite towards typed, testable code.** Small modules, pure TypeScript core, browser e2e
  harness. Behavior is otherwise identical to upstream.

The development build is named **Surfingkeys TS**, so it can be loaded next to the store version.

## Keybindings

### Changed defaults

| Key | Now does | Upstream had here |
| --- | --- | --- |
| `o` | Open the URL omnibar (same as `go`) | `o` + alias search keys |
| `O` | Open a URL in a new tab (same as `t`) | open detected links from text |
| `H` / `L` | History back / forward | `H`: open an opened URL; `L`: regional hints |
| `<Ctrl-o>` / `<Ctrl-i>` | History back / forward | — |
| `gt` / `gT` | Next / previous tab (same as `R` / `E`) | — |
| `g0` / `g$` | First / last tab; `3g0` goes to the 3rd tab | — |
| `g[` / `g]` | First / last activated tab | — |
| `g;` / `g,` | Tab history back / forward | `F`: tab history forward |
| `u` | Scroll half a page up | `e` |
| `<Ctrl-u>` / `<Ctrl-d>` | Scroll half a page up / down | — |
| `V` | Visual mode with the line selected | restore visual mode |
| `gv` | Restore the last visual selection | — |
| `<Ctrl-h>` | Hints to focus a scrollable element | — |

### Moved

These upstream bindings moved to free the keys above:

| Upstream key | New key | Action |
| --- | --- | --- |
| `L` | `gL` | Regional hints |
| `O` | `;O` | Open detected links from text |
| `H` | `;oH` | Open an already-opened URL in the current tab |
| `F` | `g,` | Tab history forward |

Also moved into the `;o…` group: `;oi` (incognito window), `;om` (URL from vim-like marks),
`;on` (new tab), `;ox` (recently closed URL), `;oh` (URL from history), and `gq` (click an image
or a button).

### Searching, qutebrowser-style

Press `o`, type a search engine's alias, then Space. The prompt switches to that engine, so
`o` `g` Space `surfingkeys` searches Google. Backspace on the empty query switches back to
URLs. The aliases are the ones you define with `addSearchAlias`, so you need no per-engine keys.

### Visual mode text objects

In visual mode, `iw`, `is` and `ip` select the word, sentence and paragraph under the cursor,
and `V` selects the line.

## Editing in rich editors

Insert-mode editing keys (`Ctrl-u`, `Ctrl-a`, `Ctrl-e`, `Alt-w`, `Alt-b`, `Alt-f`, `Alt-d`, …) and
writing text back from the vim editor (`Ctrl-i`) now work in editors that keep their own document
model, such as Microsoft Teams (CKEditor 5), Reddit (Lexical) and Slate-based apps.

- **Edits go through the editor's own input path.** Such editors revert DOM changes they did not
  make, so the fork first offers each edit as a `beforeinput` event with the target range. Only
  if the editor does not take the edit does it fall back to `execCommand`.
- **Multi-line text goes in as a paste.** Text from the vim editor that spans several lines is
  delivered as a paste event, so the editor creates real paragraphs.
- **Line start works across nodes.** `Ctrl-u` and `Ctrl-a` find the start of the line even when
  the text is split across spans.
- **A lost edit is reported.** When an editor swallows an edit, a banner says so and Surfingkeys
  steps aside on that element, instead of failing silently.

This has been checked in headless Chrome against real CKEditor 5 and Lexical builds.

## Faster hints

On big pages, these changes cut the time to show hints for `f` and `v`:

- Clickable elements are found with `querySelectorAll` and an index.
- Style reads are cached.
- Scroll targets are found by walking up from the element, not by scanning the whole page.
- The mutation observer only checks newly added nodes.

Occlusion is checked at five points per hint instead of one, so fewer hints land on covered
elements.

Detecting clickables by `cursor: pointer` is now opt-in with `settings.detectClickableByCursor`
(default `false`). Upstream always checks it, and it was the slowest part of the scan.

Insert mode now exits on Escape, a real click, or focus returning to the page body. Pages that
move focus around while they load no longer drop you out of insert mode or leave it stuck.

## Code structure

Upstream's large files are split into folders of small modules. No file the rewrite touched is
over 400 lines. Each old file remains as a small facade, so imports and the public API are
unchanged.

| Was | Now |
| --- | --- |
| `common/hints.js` (1096 lines) | `common/hints/` |
| `common/visual.js` (864) | `common/visual/` |
| `common/default.js` (1081) | `common/mappings/`, registered in the original order |
| `ui/omnibar.js` (1713) | `ui/omnibar/`, one module per omnibar type |
| `common/utils.js` (1469) | `common/utils/` behind a re-export barrel |
| `background/start.js` (2598) | `background/handlers/`, one module per domain |
| `ui/frontend.js` (1353) | `ui/frontend/`, one module per widget |
| scrolling in `normal.js` | `common/scroller.js` |

Decisions that need no DOM live in `src/core/*.ts` as pure functions with jest tests:

- key dispatch and the mode stack (`modes.ts`, `store.ts`)
- insert-mode edits as commands (`textEdit.ts`)
- scroll distances (`scroll.ts`)
- hint labels and positions (`hintLabels.ts`)
- visual selection states (`visualState.ts`)
- omnibar decisions (`omnibar.ts`)

Mode state lives in one store that is updated as `update(state, msg) → {state, effects}`, with the
effects carried out by `mode.js`.

## Building and testing

```sh
npm install
npm run build:dev    # dist/development/chrome
npm run build:prod   # dist/production/chrome
npx jest             # unit tests
```

Load `dist/development/chrome` as an unpacked extension from `chrome://extensions`.

### Browser e2e and parity

`tests/e2e/` drives the built extension in headless Chrome. Scenarios cover:

- hints, insert-mode edits in CKEditor and Lexical, the vim editor write-back
- visual motions, scrolling, tabs
- the omnibar handlers, and the full mapping table from the `?` popup

Each scenario prints one stable line per observation.

```sh
CHROME=/path/to/chrome npm run e2e
CHROME=/path/to/chrome npm run e2e:parity -- <git commit>
```

`e2e:parity` builds the given commit and the working copy, runs the scenarios against both, and
diffs the output. Every refactor in this fork was gated on an empty diff.

Chrome must be a build that can load unpacked extensions. The editor fixtures load CKEditor and
Lexical from their CDNs, so the e2e run needs network access.

## License

MIT, as upstream. All credit for Surfingkeys goes to [Brook Hong](https://github.com/brookhong)
and its contributors.
