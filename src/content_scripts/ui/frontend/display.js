import { getBrowserName } from '../../common/utils.js';

// The iframe's frame state (does it take pointer events, how tall is it) and the one popup
// that is up at a time. `st.display` is that popup: tabs, hints, banner and the keystroke
// handlers all read it, so it lives in the shared state rather than in this closure.
export default function installDisplay(self, st) {
    const _actions = self._actions;
    var _state;
    function State(pointerEvents, frameHeight, onEnter) {
        this.enter = function() {
            onEnter && onEnter();
            _state = this;
            top.postMessage({surfingkeys_uihost_data: {
                action: 'setFrontFrame',
                pointerEvents: pointerEvents,
                frameHeight: frameHeight
            }}, self.topOrigin);
        };
        this.nextState = function () {
            var visibleDivs = Array.from(document.body.querySelectorAll("body>div")).filter(function(n) {
                return n.style.display !== "none";
            });
            var pointerEvents = visibleDivs.map(function(d) {
                var id = d.id;
                var divNoPointerEvents = ["sk_keystroke", "sk_banner"];
                if (divNoPointerEvents.indexOf(id) !== -1) {
                    // no pointerEvents for bubble
                    return false;
                } else if (id === "sk_status") {
                    // only pointerEvents when input in statusBar
                    return self.statusBar.querySelector('input') !== null;
                } else {
                    // with pointerEvents for all other DIVs except that noPointerEvents is set.
                    return !d.noPointerEvents;
                }
            });
            // to make pointerEvents not empty
            pointerEvents.push(false);
            pointerEvents = pointerEvents.reduce(function(a, b) {
                return a || b;
            });

            var ns;
            if (pointerEvents) {
                ns = stateInteractive;
            } else if (visibleDivs.length > 0) {
                ns = stateVisible;
            } else {
                ns = stateInvisible;
            }
            if (this !== ns) {
                ns.enter();
            }
        };
    }
    const stateInvisible = new State("none", "0px");
    const stateVisible = new State("none", "100%");
    const stateInteractive = new State("all", "100%", function() {
        window.focus();
    });
    _state = stateInvisible;

    self.flush = function() {
        _state.nextState();
    };

    self.startInputGuard = () => {
        if (getBrowserName().startsWith("Safari")) {
            var inputGuard = setInterval(() => {
                let input = null;
                for (const a of document.querySelectorAll("input, textarea")) {
                    if (a.getBoundingClientRect().width) {
                        input = a;
                        break;
                    }
                }
                if (input && document.activeElement !== input) {
                    input.focus();
                    input.value = " "
                    setTimeout(() => {
                        input.value = ""
                    }, 10);
                } else {
                    clearInterval(inputGuard);
                }
            }, 100);
        }
    };
    _actions['hidePopup'] = function() {
        if (st.display && st.display.style.display !== "none") {
            st.display.style.display = "none";
            self.flush();
            st.display.onHide && st.display.onHide();
            self.exit();
        }
    };
    self.hidePopup = _actions['hidePopup'];

    function setDisplay(td, render) {
        if (st.display && st.display.style.display !== "none") {
            st.display.style.display = "none";
            st.display.onHide && st.display.onHide();
        }
        st.display = td;
        st.display.style.display = "";
        render && render();
        self.startInputGuard();
    }

    function showElement(td, render, onHit) {
        self.enter(0, true);
        td.onHit = onHit;
        setDisplay(td, render);
        self.flush();
    }

    return { setDisplay, showElement };
}
