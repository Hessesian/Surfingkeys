import { RUNTIME, dispatchSKEvent, runtime } from '../runtime.js';
import {
    dispatchMouseEvent,
    flashPressedLink,
    getBrowserName,
    isEditable,
} from '../utils.js';

// Clicking a hinted element (Hints.dispatchMouseClick) and the bookkeeping around it: the
// container tab to open in, and the element to send mouseout to before the next click.
export default function installMouseClick(self, st, { insert, normal, resetHints }) {
    /**
     * The default `onHintKey` implementation.
     *
     * @param {HTMLElement} element the element for which the pressed hint is targeted.
     * @name Hints.dispatchMouseClick
     * @see Hints.create
     *
     * @example
     * mapkey('q', 'click on images', function() {
     *     Hints.create("div.media_box img", Hints.dispatchMouseClick);
     * }, {domain: /weibo.com/i});
     */
    self.setContainerCookieStoreId = function(cookieStoreId) {
        st.containerCookieStoreId = cookieStoreId;
    };

    self.clearContainer = function() {
        st.containerCookieStoreId = null;
    };

    self.dispatchMouseClick = function(element) {
        if (isEditable(element)) {
            self.exit();
            normal.passFocus(true);
            element.focus();
            insert.enter(element);
        } else {
            if (!st.behaviours.multipleHits) {
                self.exit();
            }
            let tabbed = st.behaviours.tabbed, active = st.behaviours.active;
            if (st.behaviours.multipleHits) {
                const href = element.getAttribute('href');
                if (href !== null && href !== "#") {
                    tabbed = true;
                    active = false;
                }
            }

            const mouseEventModifiers = {shiftKey: st.shiftKey || active};
            if (st.shiftKey && runtime.conf.hintShiftNonActive) {
                tabbed = true;
                mouseEventModifiers.shiftKey = false;
            }
            if (tabbed) {
                const modKey = (navigator.platform.indexOf("Mac") !== -1) ? "metaKey" : "ctrlKey";
                mouseEventModifiers[modKey] = true;
            }
            const cookieStoreId = st.containerCookieStoreId;
            self.clearContainer();
            flashPressedLink(element,() => {
                if (cookieStoreId) {
                    RUNTIME("openLink", {
                        tab: {
                            tabbed: tabbed,
                            active: active || st.shiftKey,
                            cookieStoreId: cookieStoreId
                        },
                        url: getHref(element)
                    });
                } else if (tabbed && getBrowserName().startsWith("Safari")) {
                    RUNTIME("openLink", {
                        tab: {
                            tabbed: tabbed,
                            active: mouseEventModifiers.shiftKey
                        },
                        url: getHref(element)
                    });
                } else {
                    self.mouseoutLastElement();
                    dispatchMouseEvent(element, st.behaviours.mouseEvents, mouseEventModifiers);
                    dispatchSKEvent("observer", ['turnOn']);
                    st.lastMouseTarget = element;
                    if (document.activeElement.matches(runtime.conf.disabledOnActiveElementPattern)) {
                        setTimeout(() => {
                            normal.disable(true);
                        }, 100);
                    }
                }

                if (st.behaviours.multipleHits) {
                    setTimeout(resetHints, 300);
                }
            });
        }
        element.classList.remove("surfingkeys--hints--clicking");
    };

    function getHref(elm) {
        var href = elm.href;
        while (!href && elm) {
            elm = elm.parentElement;
            href = elm.href;
        }
        return href;
    }

    self.mouseoutLastElement = function() {
        if (st.lastMouseTarget) {
            dispatchMouseEvent(st.lastMouseTarget, ['mouseout'], {});
            st.lastMouseTarget = null;
        }
    };
}
