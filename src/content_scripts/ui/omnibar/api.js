import { RUNTIME, runtime } from '../../common/runtime.js';
import { isUrl } from '../../../core/omnibar';

// The members handlers and the LLM chat call on the omnibar: opening, copying, handler
// registration, folders, and the search engines.
export default function installApi(self, st, { clipboard, searchEngine }) {
    /*
     * The search engines the user has configured, alias -> {prompt, url,
     * suggestionURL}, live and read-only.
     *
     * `addSearchAlias` registers them with this frame and nowhere else, so this is
     * the only place anything in the UI frame can learn which engines exist -- the
     * LLM chat's `search_web` tool searches with them (llmtools.js). A live
     * reference rather than a copy: an alias may be added or removed while a chat
     * is open.
     */
    self.searchAliases = function() {
        return searchEngine.aliases;
    };

    self.triggerInput = function() {
        var event = new Event('input', {
            'bubbles': true,
            'cancelable': true
        });
        self.input.dispatchEvent(event);
    };

    // The frontend sets this display before invoking onHide/onShow, so it is the
    // authoritative answer to "is the omnibar on screen", which a handler needs
    // when it wants to know whether there is a user to interact with.
    self.isVisible = () => st.ui.style.display !== "none";

    /**
     * Copy from the omnibar, whoever is asking -- `<Ctrl-c>` for the listed items,
     * a handler for whatever it holds (llmchat.js `/copy`).
     *
     * `clipboard.write` copies by selecting a hidden textarea of its own and running
     * execCommand('copy'), which takes the DOCUMENT's selection -- so the focused
     * input has to give that selection up first. Hiding it does that; it is restored
     * afterwards. That is the whole reason this is not a plain `clipboard.write`
     * call at the call site: an omnibar copy that skips the hiding silently copies
     * the input's contents instead of what was asked for.
     *
     * `notice` is passed through: null when the caller says so itself, which is what
     * anything longer than a URL wants -- see Clipboard.write.
     */
    self.copy = function(text, notice) {
        self.input.style.display = "none";
        clipboard.write(text, notice);
        self.input.style.display = "";
    };

    self.isUrl = isUrl;

    self.openFocused = function() {
        var ret = false, fi = self.resultsDiv.querySelector('li.focused');
        var url;
        if (fi) {
            url = fi.url;
        } else {
            url = self.input.value;
            if (!self.isUrl(url)) {
                url = searchEngine.aliases[runtime.conf.defaultSearchEngine].url + url;
            }
        }
        var type = "", uid;
        if (fi && fi.uid) {
            uid = fi.uid;
            type = uid[0], uid = uid.substr(1);
        }
        if (type === 'T') {
            uid = uid.split(":");
            RUNTIME('focusTab', {
                windowId: parseInt(uid[0]),
                tabId: parseInt(uid[1])
            });
        } else if (url && url.length) {
            RUNTIME("openLink", {
                tab: {
                    tabbed: this.tabbed,
                    active: this.activeTab
                },
                url: url
            });
        }
        return this.activeTab;
    };

    self.addHandler = function(name, hdl) {
        if (!hdl.onEnter) {
            hdl.onEnter = self.openFocused.bind(hdl);
        }
        st.handlers[name] = hdl;
    };

    self.listBookmarkFolders = function(cb) {
        RUNTIME('getBookmarkFolders', null, function(response) {
            st.bookmarkFolders = {};
            response.folders.forEach(function(f) {
                st.bookmarkFolders[f.id] = f;
            });
            cb && cb(response, st.bookmarkFolders);
        });
    };
}
