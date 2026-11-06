import Mode from '../mode';
import KeyboardUtils from '../keyboardUtils';
import { isCapital } from '../../../core/hintLabels';

// The key handling of a hints session: hint characters, backspace, the text filter and
// the input-mask cycling. `st` is the session state, `fns` the session's own actions.
export default function installKeys(self, st, { insert, normal, hide, flip, handleHint, refreshByTextFilter }) {
    self.addEventListener('keydown', function(event) {
        event.sk_stopPropagation = true;

        let ai = st.holder.querySelector('[mode=input]>mask.activeInput');
        if (ai !== null) {
            const masks = st.holder.querySelectorAll('mask');
            var elm = ai.link;
            if (Mode.isSpecialKeyOf("<Esc>", event.sk_keyName)) {
                elm.blur();
                hide();
            } else if (event.keyCode === KeyboardUtils.keyCodes.tab) {
                ai.classList.remove('activeInput');
                st.lastCreateAttrs.activeInput = (st.lastCreateAttrs.activeInput + (event.shiftKey ? -1 : 1 )) % masks.length;
                ai = masks[st.lastCreateAttrs.activeInput];
                ai.classList.add('activeInput');

                elm = ai.link;
                elm.focus();
            } else if (event.keyCode !== KeyboardUtils.keyCodes.shiftKey) {
                event.sk_stopPropagation = false;
                hide();
                insert.enter(elm);
            }
            return;
        }

        const hints = st.holder.querySelectorAll('div');
        if (Mode.isSpecialKeyOf("<Esc>", event.sk_keyName)) {
            hide();
        } else if (event.keyCode === KeyboardUtils.keyCodes.space) {
            st.holder.style.display = "none";
        } else if (event.keyCode === KeyboardUtils.keyCodes.shiftKey) {
            flip();
        } else if (hints.length > 0) {
            if (event.keyCode === KeyboardUtils.keyCodes.backspace) {
                if (st.prefix.length > 0) {
                    st.prefix = st.prefix.substr(0, st.prefix.length - 1);
                    handleHint(event);
                } else if (st.textFilter.length > 0) {
                    st.textFilter = st.textFilter.substr(0, st.textFilter.length - 1);
                    refreshByTextFilter();
                }
            } else {
                var key = event.sk_keyName;
                if (isCapital(key)) {
                    st.shiftKey = true;
                }
                if (key !== '') {
                    if (st.numeric) {
                        if (key >= "0" && key <= "9") {
                            st.prefix += key;
                        } else {
                            st.textFilter += key;
                            refreshByTextFilter();
                        }
                        handleHint(event);
                    } else if (st.characters.toLowerCase().indexOf(key.toLowerCase()) !== -1) {
                        st.prefix = st.prefix + key.toUpperCase();
                        handleHint(event);
                    } else {
                        if (normal.isScrollKeyInHints(key) && st.excludedScrollKeys.indexOf(key) === -1) {
                            // pass on the key to normal mode to scroll page.
                            event.sk_stopPropagation = false;
                        } else {
                            // quit hints if user presses non-hint key and no keys for scrolling
                            hide();
                        }
                    }
                }
            }
        }
    });
    self.addEventListener('keyup', function(event) {
        if (event.keyCode === KeyboardUtils.keyCodes.space) {
            st.holder.style.display = "";
        }
    });
}
