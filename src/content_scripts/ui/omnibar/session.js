import KeyboardUtils from '../../common/keyboardUtils';
import Mode from '../../common/mode';
import { runtime } from '../../common/runtime.js';
import { getBrowserName, setSanitizedContent } from '../../common/utils.js';
import { getPosition } from './state';

// The input element and its keys, and the show/hide life cycle. Returns `escapePressed`,
// which the Esc mapping shares with the input's own keydown handler.
export default function installSession(self, st, front) {
    const ui = st.ui;
    const position = () => getPosition(st, runtime);

    function onInput() {
        if (st.lastInput !== self.input.value) {
            st.lastInput = self.input.value;
        }
        st.handler.onInput && st.handler.onInput.call(this);
    }
    /*
     * Esc closes the omnibar, unless the handler has something of its own to stop
     * first -- the LLM chat stops the answer it is working on and stays open, so the
     * user can read where it got to (llmchat.js `onEsc`).
     *
     * Both routes a key can take to the omnibar come through here, because Esc is
     * MAPPED: `Mode.handleMapKey` runs on window capture, so a mapped key never
     * reaches the input's own keydown handler, and a stop wired only into the latter
     * would never run. The mapping is the live route today; the input handler is kept
     * in step so that the two cannot answer Esc differently, which means a handler's
     * `onKeydown` must pass Esc back rather than consume it (llmchat.js does).
     */
    function escapePressed() {
        if (st.handler && st.handler.onEsc && st.handler.onEsc()) {
            return;
        }
        front.hidePopup();
    }

    function onKeyDown(evt) {
        if (st.handler && st.handler.onKeydown && st.handler.onKeydown.call(evt.target, evt)) {
            return;
        }
        if (Mode.isSpecialKeyOf("<Esc>", evt.sk_keyName)) {
            escapePressed();
            evt.preventDefault();
        } else if (evt.keyCode === KeyboardUtils.keyCodes.enter) {
            st.handler.activeTab = !evt.ctrlKey;
            st.handler.tabbed = self.tabbed ^ evt.shiftKey;
            st.handler.onEnter() && front.hidePopup();
        } else if (evt.keyCode === KeyboardUtils.keyCodes.space) {
            const cursor = self.input.selectionStart;
            const textBeforeCursor = self.input.value.substring(0, cursor);
            const newQuery = self.input.value.substring(cursor);
            self.expandAlias(textBeforeCursor, newQuery) && evt.preventDefault();
        } else if (evt.keyCode === KeyboardUtils.keyCodes.backspace) {
            self.collapseAlias() && evt.preventDefault();
        }
    }
    function createInput() {
        var _input = document.createElement("input");
        _input.oninput = onInput;
        _input.onkeydown = onKeyDown;
        _input.addEventListener('compositionstart', function(evt) {
            _input.oninput = null;
            _input.onkeydown = null;
        });
        _input.addEventListener('compositionend', function(evt) {
            _input.oninput = onInput;
            _input.onkeydown = onKeyDown;
            onInput();
        });
        return _input;
    }

    ui.onShow = function(args) {
        st.handler = st.handlers[args.type];
        if (!self.input) {
            self.input = createInput();
            document.querySelector("#sk_omnibarSearchArea").insertBefore(self.input, st.resultPageSpan);
        }
        st.savedArgs = args;
        ui.classList.remove("sk_omnibar_middle");
        ui.classList.remove("sk_omnibar_bottom");
        if (getBrowserName() === "Safari-iOS") {
            runtime.conf.omnibarPosition = "bottom";
        }
        ui.classList.add("sk_omnibar_" + position());
        if (position() === "bottom") {
            self.resultsDiv.remove();
            ui.insertBefore(self.resultsDiv, document.querySelector("#sk_omnibarSearchArea"));
        } else {
            self.resultsDiv.remove();
            ui.append(self.resultsDiv);
        }

        self.tabbed = (args.tabbed !== undefined) ? args.tabbed : true;
        self.input.focus();
        self.enter();
        if (args.pref) {
            self.input.value = args.pref;
        }
        self.resultsDiv.className = "";
        st.handler.onOpen && st.handler.onOpen(args.extra);
        st.lastHandler = st.handler;
        setSanitizedContent(self.promptSpan, st.handler.prompt);
        setSanitizedContent(st.resultPageSpan, "");
        ui.scrollTop = 0;
    };

    ui.onHide = function() {
        // clear cache
        delete self.cachedPromise;
        // delete only deletes properties of an object and
        // cannot normally delete a variable declared using var, whatever the scope.
        st.items = null;
        st.bookmarkFolders = null;

        st.lastInput = "";
        self.input.value = "";
        self.input.placeholder = "";
        setSanitizedContent(self.resultsDiv, "");
        st.lastHandler = null;
        st.handler.onClose && st.handler.onClose();
        self.exit();
        st.handler = null;
    };

    return { escapePressed };
}
