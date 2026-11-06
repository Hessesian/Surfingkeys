import Trie from '../trie';
import { dispatchSKEvent, runtime } from '../runtime.js';
import Mode from '../mode';
import KeyboardUtils from '../keyboardUtils';
import {
    dispatchMouseEvent,
    flashPressedLink,
    getBrowserName,
    getTextNodes,
} from '../utils.js';
import { STATE_NAMES } from '../../../core/visualState';
import { UNITS, selectUnit } from './units.js';
import { findNextTextNodeBy } from './find.js';

// Visual mode's keys and what they do to the selection.
export default function installMappings(self, st, clipboard) {
    const selection = st.selection, cursor = st.cursor;
    const status = STATE_NAMES;

    self.mappings = new Trie();
    self.map_node = self.mappings;
    self.repeats = "";
    self.mappings.add("l", {
        annotation: "forward character",
        feature_group: 9,
        code: modifySelection
    });
    self.mappings.add("h", {
        annotation: "backward character",
        feature_group: 9,
        code: modifySelection
    });
    self.mappings.add("j", {
        annotation: "forward line",
        feature_group: 9,
        repeatNoThrottling: true,
        code: modifySelection
    });
    self.mappings.add("k", {
        annotation: "backward line",
        feature_group: 9,
        repeatNoThrottling: true,
        code: modifySelection
    });
    self.mappings.add("w", {
        annotation: "forward word",
        feature_group: 9,
        code: modifySelection
    });
    self.mappings.add("e", {
        annotation: "forward word",
        feature_group: 9,
        code: modifySelection
    });
    self.mappings.add("b", {
        annotation: "backward word",
        feature_group: 9,
        code: modifySelection
    });
    self.mappings.add(")", {
        annotation: "forward sentence",
        feature_group: 9,
        code: modifySelection
    });
    self.mappings.add("(", {
        annotation: "backward sentence",
        feature_group: 9,
        code: modifySelection
    });
    self.mappings.add("}", {
        annotation: "forward paragraphboundary",
        feature_group: 9,
        code: modifySelection
    });
    self.mappings.add("{", {
        annotation: "backward paragraphboundary",
        feature_group: 9,
        code: modifySelection
    });
    self.mappings.add("0", {
        annotation: "backward lineboundary",
        feature_group: 9,
        code: modifySelection
    });
    self.mappings.add("$", {
        annotation: "forward lineboundary",
        feature_group: 9,
        code: modifySelection
    });
    self.mappings.add("G", {
        annotation: "forward documentboundary",
        feature_group: 9,
        code: function() {
            document.scrollingElement.scrollTop = document.scrollingElement.scrollHeight;
            if (getBrowserName() !== "Firefox") {
                modifySelection();
            } else {
                self.hideCursor();
                selection.setPosition(document.body.lastChild, 0);
                self.showCursor();
            }
            if (st.matches.length) {
                st.currentOccurrence = st.matches.length - 1;
                dispatchSKEvent("front", ['showStatus', [undefined, undefined, st.currentOccurrence + 1 + ' / ' + st.matches.length]]);
            }
        }
    });
    self.mappings.add("gg", {
        annotation: "backward documentboundary",
        feature_group: 9,
        code: function() {
            // there may be some fixed-position div for navbar on top on some pages.
            // so scrollIntoView can not send us top, as it's already in view.
            // explicitly set scrollTop 0 here.
            document.scrollingElement.scrollTop = 0;
            st.currentOccurrence = 0;
            if (st.matches.length) {
                dispatchSKEvent("front", ['showStatus', [undefined, undefined, st.currentOccurrence + 1 + ' / ' + st.matches.length]]);
            }

            if (getBrowserName() !== "Firefox") {
                modifySelection();
            } else {
                self.hideCursor();
                selection.setPosition(document.body.firstChild, 0);
                self.showCursor();
            }
        }
    });

    self.mappings.add("o", {
        annotation: "Go to Other end of highlighted text",
        feature_group: 9,
        code: function() {
            self.hideCursor();
            var pos = [selection.anchorNode, selection.anchorOffset];
            selection.collapse(selection.focusNode, selection.focusOffset);
            selection.extend(pos[0], pos[1]);
            self.showCursor();
        }
    });
    // Whole unit around the cursor, like vim's text objects: to its end and back to its
    // start, then across it.
    function selectInner(w) {
        if (getBrowserName() === "Firefox" && (w === "p" || w === "s")) {
            return;
        }
        var unit = UNITS[w];
        self.hideCursor();
        st.state = 2;
        st.onStateChange();
        selection.modify("move", "forward", unit);
        selection.modify("move", "backward", unit);
        selection.modify("extend", "forward", unit);
        self.showCursor();
    }
    var _yankFunctions = [{}, {
        annotation: "Yank a word(w) or line(l) or sentence(s) or paragraph(p)",
        feature_group: 9,
        code: function(w) {
            var pos = [selection.focusNode, selection.focusOffset];
            self.hideCursor();
            selectUnit(w);
            clipboard.write(selection.toString());
            selection.collapseToStart();
            selection.setPosition(pos[0], pos[1]);
            self.showCursor();
        }
    }, {
        annotation: "Copy selected text",
        feature_group: 9,
        code: function() {
            var pos = [selection.focusNode, selection.focusOffset];
            clipboard.write(selection.toString());
            if (runtime.conf.modeAfterYank === "Caret") {
                selection.setPosition(pos[0], pos[1]);
                self.showCursor();
                st.state = 1;
                st.onStateChange();
            } else if (runtime.conf.modeAfterYank === "Normal") {
                st.state = 2;
                self.toggle();
            }
        }
    }];
    self.mappings.add("*", {
        annotation: "Search word under the cursor",
        feature_group: 9,
        code: function() {
            self.star();
        }
    });
    function clickLink(element, shiftKey) {
        flashPressedLink(element, () => {
            dispatchMouseEvent(element, ['click'], {shiftKey});
        });
    }
    self.mappings.add(KeyboardUtils.encodeKeystroke("<Enter>"), {
        annotation: "Click on node under cursor.",
        feature_group: 9,
        code: function() {
            clickLink(selection.focusNode.parentNode, false);
        }
    });
    self.mappings.add(KeyboardUtils.encodeKeystroke("<Shift-Enter>"), {
        annotation: "Click on node under cursor.",
        feature_group: 9,
        code: function() {
            clickLink(selection.focusNode.parentNode, true);
        }
    });
    self.mappings.add("zt", {
        annotation: "make cursor at top of window.",
        feature_group: 9,
        code: function() {
            var offset = cursor.getBoundingClientRect().top;
            self.hideCursor();
            document.scrollingElement.scrollTop += offset;
            self.showCursor();
        }
    });
    self.mappings.add("zz", {
        annotation: "make cursor at center of window.",
        feature_group: 9,
        code: function() {
            var offset = cursor.getBoundingClientRect().top - window.innerHeight/2;
            self.hideCursor();
            document.scrollingElement.scrollTop += offset;
            self.showCursor();
        }
    });
    self.mappings.add("zb", {
        annotation: "make cursor at bottom of window.",
        feature_group: 9,
        code: function() {
            var offset = window.innerHeight - cursor.getBoundingClientRect().bottom;
            self.hideCursor();
            document.scrollingElement.scrollTop -= offset;
            self.showCursor();
        }
    });
    self.mappings.add("f", {
        annotation: "Forward to next char.",
        feature_group: 9,
        code: function() {
            self.statusLine = self.name + " - " + status[st.state] + " - forward";
            Mode.showStatus();
            st.visualf = 1;
        }
    });
    self.mappings.add("F", {
        annotation: "Backward to next char.",
        feature_group: 9,
        code: function() {
            self.statusLine = self.name + " - " + status[st.state] + " - backward";
            Mode.showStatus();
            st.visualf = -1;
        }
    });
    self.mappings.add(";", {
        annotation: "Repeat latest f, F",
        feature_group: 9,
        code: function() {
            if (st.lastF) {
                visualSeek(st.lastF[0], st.lastF[1]);
            }
        }
    });
    self.mappings.add(",", {
        annotation: "Repeat latest f, F in opposite direction",
        feature_group: 9,
        code: function() {
            if (st.lastF) {
                visualSeek(-st.lastF[0], st.lastF[1]);
            }
        }
    });

    self.mappings.add("p", {
        annotation: "Expand selection to parent element",
        feature_group: 9,
        code: function() {
            var p = selection.focusNode;
            while (p !== document.body) {
                p = p.parentElement;
                var textNodes = getTextNodes(p, /./);
                var lastNode = textNodes[textNodes.length-1];
                var range = selection.getRangeAt(0);
                if (range.comparePoint(textNodes[0], 0) === -1
                    || range.comparePoint(lastNode, lastNode.length) === 1) {
                    self.hideCursor();
                    st.state = 2;
                    st.onStateChange();
                    selection.setBaseAndExtent(textNodes[0], 0, lastNode, lastNode.length);
                    self.showCursor();
                    break;
                }
            }
        }
    });

    self.mappings.add("V", {
        annotation: "Select the line under the cursor",
        feature_group: 9,
        code: function() {
            selectInner("l");
        }
    });
    self.mappings.add("iw", {
        annotation: "Select the word under the cursor",
        feature_group: 9,
        code: function() {
            selectInner("w");
        }
    });
    self.mappings.add("is", {
        annotation: "Select the sentence under the cursor",
        feature_group: 9,
        code: function() {
            selectInner("s");
        }
    });
    self.mappings.add("ip", {
        annotation: "Select the paragraph under the cursor",
        feature_group: 9,
        code: function() {
            selectInner("p");
        }
    });
    function visualSeek(dir, chr) {
        self.hideCursor();
        var lastPosBeforeF = [selection.anchorNode, selection.anchorOffset];
        if (selection.focusNode
            && selection.focusNode.textContent
            && selection.focusNode.textContent.length
            && selection.focusNode.textContent[selection.focusOffset] === chr
            && dir === 1
        ) {
            // if the char after cursor is the char to find, forward one step.
            selection.setPosition(selection.focusNode, selection.focusOffset + 1);
        }
        if (findNextTextNodeBy(chr, true, (dir === -1))) {
            if (st.state === 1) {
                selection.setPosition(selection.focusNode, selection.focusOffset - 1);
            } else {
                var found = [selection.focusNode, selection.focusOffset - 1];
                selection.collapseToStart();
                selection.setPosition(lastPosBeforeF[0], lastPosBeforeF[1]);
                selection.extend(found[0], found[1]);
            }
        } else {
            selection.setPosition(lastPosBeforeF[0], lastPosBeforeF[1]);
        }
        self.showCursor();
    }
    function modifySelection() {
        var sel = self.map_node.meta.annotation.split(" ");
        var alter = (st.state === 2) ? "extend" : "move";
        self.hideCursor();
        var prevPos = [selection.focusNode, selection.focusOffset];
        selection.modify(alter, sel[0], sel[1]);

        if (prevPos[0] === selection.focusNode && prevPos[1] === selection.focusOffset) {
            selection.modify(alter, sel[0], "word");
        }
        self.showCursor();
    }

    // yankFunctions[state] is what `y` does in each state; session.js rebinds it on every
    // state change.
    st.yankFunctions = _yankFunctions;
    st.visualSeek = visualSeek;
    st.selectInner = selectInner;
}
