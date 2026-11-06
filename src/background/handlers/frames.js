export default function registerFrames(bg) {
    const {self, _response} = bg;
    const sendTabMessage = (...args) => bg.sendTabMessage(...args);


    /*
     * Hand a Chrome MV3 user script the scope naming its document's DOM-event
     * channels (see skEventName in runtime.js). The user script runs in that same
     * document but in a JS world of its own, so it cannot see the scope the content
     * script drew there, and page script cannot send an extension message at all --
     * this is the one path the scope travels.
     *
     * Asked of the content script in the sender's own frame rather than served from a
     * table here: this background is a service worker Chrome kills whenever it
     * pleases, and nothing here can re-derive a scope it has forgotten, so a
     * remembered one would leave the user script in an already-loaded frame unable to
     * ever learn the name and its snippets quiet until the page was reloaded.
     */
    self.getChannelScope = function(message, sender, sendResponse) {
        // terminal: asking again cannot conjure a frame the sender never named, and
        // the caller would otherwise spend its whole retry budget on it.
        if (!sender.tab || typeof sender.frameId !== "number") {
            return { error: "no frame to ask", terminal: true };
        }
        // documentId when Chrome gives one: a frame reuses its frameId across
        // navigations, so mid-navigation the frameId can name the document that
        // replaced the sender's, whose scope names channels nobody listens on.
        const target = sender.documentId
            ? { documentId: sender.documentId }
            : { frameId: sender.frameId };
        try {
            chrome.tabs.sendMessage(sender.tab.id, { subject: "getChannelScope" }, target, function(res) {
                if (chrome.runtime.lastError) {
                    // The document did not answer. Its content script registers this
                    // handler at document_start, so a failure here is worth another
                    // ask; the caller decides when to stop.
                    _response(message, sendResponse, { error: chrome.runtime.lastError.message });
                } else if (!res || typeof res.scope !== "string") {
                    _response(message, sendResponse, { error: "the frame did not answer" });
                } else {
                    _response(message, sendResponse, { scope: res.scope });
                }
            });
        } catch (e) {
            return { error: e.message };
        }
    };
    /*
     * The text of ANOTHER tab, for the LLM chat's `read_tab` -- the counterpart of
     * `request` above: that one asks the network for a URL, this one asks the tab
     * the user already has open, so the page arrives as their browser rendered it,
     * after its scripts ran and with their session on it.
     *
     * Only the content script of that tab can read it, and only the background can
     * address a tab it does not live in, so this is the middle of that chain. Frame
     * 0 alone is asked: the answer must be the top document, not whichever iframe
     * replies first.
     *
     * The callback form of sendMessage rather than its promise, since `chrome` in
     * Firefox has no promises (see sendTabMessage), and every failure is answered as
     * an `error` string: a tab with no content script in it -- a browser page, the
     * PDF viewer, an unloaded tab -- rejects here, and the caller has to be able to
     * tell the model that instead of timing out.
     *
     * `self` says the caller asked for its own tab, which its own `read_page` serves
     * better; it is a hint, so a sender without a tab simply does not get it.
     */
    self.getTabMarkdown = function(message, sender, sendResponse) {
        const tabId = message.tabId;
        if (!Number.isInteger(tabId)) {
            _response(message, sendResponse, {
                error: "no tab id was given"
            });
            return;
        }
        const isSelf = !!(sender.tab && sender.tab.id === tabId);
        try {
            chrome.tabs.sendMessage(tabId, {
                subject: "getTabMarkdown"
            }, {frameId: 0}, function(res) {
                if (chrome.runtime.lastError) {
                    _response(message, sendResponse, {
                        error: chrome.runtime.lastError.message
                    });
                } else if (!res) {
                    _response(message, sendResponse, {
                        error: "the tab did not answer"
                    });
                } else {
                    _response(message, sendResponse, {
                        markdown: res.markdown || "",
                        error: res.error,
                        self: isSelf
                    });
                }
            });
        } catch (e) {
            _response(message, sendResponse, {
                error: e.message
            });
        }
    };
    self.nextFrame = function(message, sender, sendResponse) {
        const tid = sender.tab.id;
        chrome.scripting.executeScript({
            target: {
                allFrames: true,
                tabId: tid,
            },
            func: () => {
                return typeof(getFrameId) === 'function' ? getFrameId() : 0;
            },
        }, function(framesInTab) {
            framesInTab = framesInTab.map((res) => {
                return res.result;
            }).filter((frameId) => {
                return frameId;
            });

            if (framesInTab.length > 0) {
                let i = 0;
                for (i = 0; i < framesInTab.length; i++) {
                    if (framesInTab[i] === message.frameId) {
                        break;
                    }
                }
                i = (i === framesInTab.length - 1) ? 0 : i + 1;
                sendTabMessage(tid, -1, {
                    subject: "focusFrame",
                    frameId: framesInTab[i]
                });
            }
        });
    };
}
