import { RUNTIME, dispatchSKEvent, runtime } from '../runtime.js';
import {
    actionWithSelectionPreserved,
    filterAncestors,
    getTextNodes,
    getVisibleElements,
    getWordUnderCursor,
    scrollIntoViewIfNeeded,
} from '../utils.js';
import { selectUnit } from './units.js';

export function findNextTextNodeBy(query, caseSensitive, backwards) {
    const selection = document.getSelection();
    var found = false;
    // window.find sometimes does not move selection forward
    var firstNode = null;
    while (window.find(query, caseSensitive, backwards)) {
        if (selection.anchorNode.splitText) {
            found = true;
            break;
        } else if (firstNode === null) {
            firstNode = selection.anchorNode;
        } else if (firstNode === selection.anchorNode) {
            break;
        }
    }
    return found;
}

// Searching the page for text and marking the matches: `/`, `n`, `*` and the LLM chat's
// highlights. Returns `select`, which moves the selection onto a match.
export default function installFind(self, st, marks) {
    const selection = st.selection;
    const { createMatchMark } = marks;

    function getTextNodeByY(y) {
        var node = null;
        var treeWalker = getTextNodes(document.body, /./, 0);
        while (treeWalker.nextNode()) {
            var br = treeWalker.currentNode.parentNode.getBoundingClientRect();
            if (br.top > window.innerHeight * y) {
                node = treeWalker.currentNode;
                break;
            }
        }
        return node;
    }

    function select(found) {
        self.hideCursor();
        if (selection.anchorNode && st.state === 2) {
            selection.extend(found[0], found[1]);
        } else {
            selection.setPosition(found[0], found[1]);
        }
        self.showCursor();
    }

    function highlight(pattern) {
        const gpattern = new RegExp(pattern.source, "g" + pattern.flags);
        getTextNodes(document.body, pattern).forEach(function(node) {
            var mtches;
            while ((mtches = gpattern.exec(node.data)) !== null) {
                var match = mtches[0];
                if (match.length) {
                    var pos = gpattern.lastIndex - match.length;
                    createMatchMark(node, pos, node, pos + match.length);
                } else {
                    // matches like \b
                    break;
                }
            }
        });
        if (st.matches.length) {
            st.currentOccurrence = 0;
            for (var i = 0; i < st.matches.length; i++) {
                var br = st.matches[i][2][0].getBoundingClientRect();
                if (br.top > 0) {
                    st.currentOccurrence = i;
                    break;
                }
            }
            dispatchSKEvent("front", ['showStatus', [undefined, undefined, st.currentOccurrence + 1 + ' / ' + st.matches.length]]);
        }
    }

    self.visualClear = function() {
        marks.clearSelectionMark();
        self.hideCursor();
        st.matches = [];
        marks.removeHolder();
        dispatchSKEvent("front", ['showStatus', [undefined, undefined, ""]]);
    };

    self.star = function() {
        if (selection.focusNode && selection.focusNode.nodeValue) {
            var query = getWordUnderCursor();
            if (query.length && query !== ".") {
                self.hideCursor();
                var pos = [selection.focusNode, selection.focusOffset];
                RUNTIME('updateInputHistory', { find: query });
                self.visualClear();
                highlight(new RegExp(query, runtime.getCaseSensitive(query) ? "" : "i"));
                selection.setPosition(pos[0], pos[1]);
                self.showCursor();
            }
        }
    };

    self.next = function(backward) {
        if (st.matches.length) {
            // need enter visual mode again when modeAfterYank is set to Normal / Caret.
            if (st.state === 0) {
                self.enter();
            }
            st.currentOccurrence = (backward ? (st.matches.length + st.currentOccurrence - 1) : (st.currentOccurrence + 1)) % st.matches.length;
            select(st.matches[st.currentOccurrence]);
            dispatchSKEvent("front", ['showStatus', [undefined, undefined, st.currentOccurrence + 1 + ' / ' + st.matches.length]]);
        } else if (runtime.conf.lastQuery) {
            highlight(new RegExp(runtime.conf.lastQuery, runtime.getCaseSensitive(runtime.conf.lastQuery) ? "" : "i"));
            self.visualEnter(runtime.conf.lastQuery);
        }
    };

    self.visualUpdate = function(query) {
        self.visualClear();

        // set caret to top in view
        selection.setPosition(getTextNodeByY(0), 0);

        var scrollTop = document.scrollingElement.scrollTop,
            posToStartFind = [selection.anchorNode, selection.anchorOffset];

        var caseSensitive = runtime.getCaseSensitive(query);
        if (findNextTextNodeBy(query, caseSensitive, false)) {
            selection.setPosition(posToStartFind[0], posToStartFind[1]);
        } else {
            // start from beginning if no found from current position
            selection.setPosition(document.body.firstChild, 0);
        }

        if (findNextTextNodeBy(query, caseSensitive, false)) {
            if (document.scrollingElement.scrollTop !== scrollTop) {
                // set new start position if there is no occurrence in current view.
                scrollTop = document.scrollingElement.scrollTop;
                posToStartFind = [selection.anchorNode, selection.anchorOffset];
            }
            createMatchMark(selection.anchorNode, selection.anchorOffset, selection.focusNode, selection.focusOffset);

            while (document.scrollingElement.scrollTop === scrollTop && findNextTextNodeBy(query, caseSensitive, false)) {
                createMatchMark(selection.anchorNode, selection.anchorOffset, selection.focusNode, selection.focusOffset);
            }
            document.scrollingElement.scrollTop = scrollTop;
            selection.setPosition(posToStartFind[0], posToStartFind[1]);
        }

    };

    self.visualEnter = function (query) {
        if (query.length === 0 || query === ".") {
            return;
        }
        self.visualClear();
        highlight(new RegExp(query, runtime.getCaseSensitive(query) ? "" : "i"));
        if (st.matches.length) {
            self.enter();
            select(st.matches[st.currentOccurrence]);
        } else {
            dispatchSKEvent("front", ['showStatus', [undefined, undefined, "Pattern not found: {0}".format(query)], 1000]);
        }
    };

    /**
     * Mark every occurrence of a LITERAL string and bring the first one into view,
     * without entering visual mode and without moving the selection.
     *
     * `visualEnter` is the same highlight followed by a mode change and a selection
     * on the match, which is what a user pressing Enter on `/` asked for. A caller
     * that is only pointing the user at something did not: the LLM chat highlights
     * where on the page its answer came from while the omnibar still holds the
     * focus, and entering visual mode under it would leave the two fighting over
     * every keystroke.
     *
     * The query is escaped rather than compiled, because it comes from a model or
     * from page text rather than from someone typing a pattern: an unbalanced
     * bracket in it would otherwise throw instead of matching nothing.
     *
     * @param {string} query the text to look for.
     * @returns {number} how many occurrences were marked.
     */
    self.highlightMatches = function (query) {
        self.visualClear();
        if (!query) {
            return 0;
        }
        const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        highlight(new RegExp(escaped, runtime.getCaseSensitive(query) ? "" : "i"));
        if (st.matches.length) {
            // `highlight` already picked the first occurrence at or below the top of
            // the viewport, so this scrolls only when there is none in view
            scrollIntoViewIfNeeded(st.matches[st.currentOccurrence][2][0], true);
        }
        return st.matches.length;
    };

    self.findSentenceOf = function (query) {
        var wr = new RegExp("\\b" + query + "\\b");
        var elements = getVisibleElements(function(e, v) {
            if (wr.test(e.innerText)) {
                v.push(e);
            }
        });
        elements = filterAncestors(elements);

        var sentence = "";
        actionWithSelectionPreserved(function(selection) {
            selection.setPosition(elements[0], 0);
            if (window.find(query, false, false, true, true)) {
                selectUnit("s");
                sentence = selection.toString();
            }
        });
        return sentence;
    };

    return { select };
}
