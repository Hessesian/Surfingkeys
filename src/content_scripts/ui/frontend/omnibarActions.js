import { setSanitizedContent } from '../../common/utils.js';

// Opening the omnibar, and the finder that shares the status bar.
export default function installOmnibarActions(self, { omnibar, find, showElement }) {
    const _actions = self._actions;
    const _omnibar = document.getElementById('sk_omnibar');
    _actions['openOmnibar'] = function(message) {
        showElement(_omnibar, () => {
            _omnibar.onShow(message);
            const style = message.style || "";
            setSanitizedContent(_omnibar.querySelector('style'), `#sk_omnibar {${style}}`);
        });
    };
    self.openOmnibar = _actions['openOmnibar'];
    /*
     * Put the omnibar back on screen WITHOUT re-opening it: no `onShow`, so no
     * `onOpen`, so the handler keeps every bit of state it had. The LLM chat reveals
     * itself this way to ask about a tool call while hidden (llmchat.js
     * `confirmToolUse`), and re-opening would reload its conversation from storage
     * over the live one the call belongs to.
     *
     * Only valid for an omnibar that was hidden without being closed -- its mode is
     * still on the stack and its handler still installed, which is what makes the
     * keystrokes that answer the prompt land. A closed omnibar has to be opened.
     *
     * Deliberately not an `_actions` entry: nothing outside this frame reveals a
     * hidden chat, and a message that could would let a page put the omnibar up.
     */
    self.revealOmnibar = function() {
        showElement(_omnibar);
        omnibar.input.focus();
    };
    _actions['openFinder'] = function() {
        find.open();
    };

}
