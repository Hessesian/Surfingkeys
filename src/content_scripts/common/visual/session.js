import { runtime } from '../runtime.js';
import Mode from '../mode';
import KeyboardUtils from '../keyboardUtils';
import { getTextRect } from '../utils.js';
import { STATE_NAMES, afterEsc, nextState, stateOnClick } from '../../../core/visualState';
import installCursor from './cursor.js';
import createMarks from './marks.js';
import installFind from './find.js';
import installMappings from './mappings.js';

function createVisual(clipboard, hints) {
    var self = new Mode("Visual");
    const status = STATE_NAMES;
    const cursor = document.createElement("div");
    cursor.className = "surfingkeys_cursor";
    cursor.style.zIndex = 2147483299;
    // Everything visual mode mutates, shared with the other modules in this directory.
    // `state` is 0 off, 1 caret, 2 range (see core/visualState.ts).
    const st = {
        selection: document.getSelection(),
        matches: [],
        currentOccurrence: 0,
        state: 0,
        markTemplate: document.createElement("div"),
        cursor,
        // f in visual mode
        visualf: 0,
        lastF: null,
        yankFunctions: null,
        visualSeek: null,
        selectInner: null,
        onStateChange: null,
    };
    const selection = st.selection;
    const marks = createMarks(st);
    let select;

    self.addEventListener('keydown', function(event) {
        if (st.visualf) {
            var exitf = false;
            event.sk_stopPropagation = true;
            event.sk_suppressed = true;

            if (KeyboardUtils.isWordChar(event)) {
                st.visualSeek(st.visualf, event.sk_keyName);
                st.lastF = [st.visualf, event.sk_keyName];
                exitf = true;
            } else if (Mode.isSpecialKeyOf("<Esc>", event.sk_keyName)) {
                exitf = true;
            }

            if (exitf) {
                self.statusLine = self.name + " - " + status[st.state];
                Mode.showStatus();
                st.visualf = 0;
            }
        } else if (event.sk_keyName.length) {
            Mode.handleMapKey.call(self, event);
            if (event.sk_stopPropagation) {
                event.sk_suppressed = true;
            } else if (Mode.isSpecialKeyOf("<Esc>", event.sk_keyName)) {
                if (st.state > 1) {
                    self.hideCursor();
                    selection.collapse(selection.anchorNode, selection.anchorOffset);
                    self.showCursor();
                } else {
                    self.visualClear();
                    self.exit();
                }
                st.state = afterEsc(st.state);
                _onStateChange();
                event.sk_stopPropagation = true;
                event.sk_suppressed = true;
            }
        }
    });
    self.addEventListener('scroll', function(event) {
        st.matches.forEach(function(m) {
            const r = getTextRect(m[0], m[1])[0];
            m[2].forEach((mi) => {
                mi.style.left = document.scrollingElement.scrollLeft + r.left + 'px';
                mi.style.top = document.scrollingElement.scrollTop + r.top + 'px';
            });
        });
    });

    self.addEventListener('click', function(event) {
        const next = stateOnClick(st.state, selection.type);
        const changed = next !== st.state;
        if (changed || selection.type === "None") {
            self.hideCursor();
        }
        st.state = next;
        if (changed && selection.type !== "None") {
            self.showCursor();
        }
        _onStateChange();
    });

    self.addEventListener('resize', function(event) {
        if (runtime.conf.lastQuery) {
            self.visualUpdate(runtime.conf.lastQuery);
        }
        if (st.matches[st.currentOccurrence]) {
            select(st.matches[st.currentOccurrence]);
        }
    });
    self.addEventListener('selectionchange', function(event) {
        marks.markSelection();
    });

    st.onStateChange = _onStateChange;
    installMappings(self, st, clipboard);
    installCursor(self, st);
    ({ select } = installFind(self, st, marks));

    self.emptySelection = function() {
        document.getSelection().empty();
    };

    self.onEnter = function() {
        _incState();
    };

    self.onExit = function() {
        self.visualClear();
    };

    function _onStateChange() {
        self.mappings.add("y", st.yankFunctions[st.state]);
        self.statusLine = self.name + " - " + status[st.state];
        Mode.showStatus();
    }
    function _incState() {
        st.state = nextState(st.state);
        _onStateChange();
    }

    self.restore = function() {
        if (selection && selection.anchorNode) {
            selection.setPosition(selection.anchorNode, selection.anchorOffset);
            self.showCursor();
            self.enter();
        }
    };
    self.toggle = function(ex) {
        switch (st.state) {
            case 1:
                selection.extend(selection.anchorNode, selection.anchorOffset);
                _incState();
                break;
            case 2:
                self.hideCursor();
                selection.collapse(selection.focusNode, selection.focusOffset);
                self.exit();
                _incState();
                break;
            default:
                hints.create(runtime.conf.textAnchorPat, function (element) {
                    setTimeout(function () {
                        selection.setPosition(element[0], element[1]);
                        self.enter();
                        if (ex === "z") {
                            if (element[1] === 0) {
                                selection.extend(element[0], element[0].textContent.length);
                            } else {
                                selection.extend(element[0], element[1] + element[2].length);
                            }
                            _incState();
                        } else if (ex === "V") {
                            st.selectInner("l");
                        }
                        self.showCursor();
                    }, 0);
                });
                break;
        }
    };

    self.feedkeys = function(keys) {
        setTimeout(function() {
            var evt = new Event("keydown");
            for (var i = 0; i < keys.length; i ++) {
                evt.sk_keyName = keys[i];
                Mode.handleMapKey.call(self, evt);
            }
        }, 1);
    };
    return self;
}

export default createVisual;
