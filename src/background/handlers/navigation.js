export default function registerNavigation(bg) {
    const {self, browser, conf, tabMessages, _response, state} = bg;
    const sendTabMessage = (...args) => bg.sendTabMessage(...args);
    const getActiveTab = (...args) => bg.getActiveTab(...args);
    const isSplitViewAvailable = (...args) => bg.isSplitViewAvailable(...args);

    function normalizeURL(url) {
        if (!/^view-source:|^javascript:/.test(url) && /^(?:https?:\/\/)?(?:[^@\/\n]+@)?(?:www\.)?([^:\/\n]+)/im.test(url)) {
            if (/^[\w-]+?:/i.test(url)) {
                url = url;
            } else {
                url = "http://" + url;
            }
        }
        return url;
    }

    function openUrlInNewTab(currentTab, url, message) {
        var newTabPosition;
        if (currentTab) {
            switch (conf.newTabPosition) {
                case 'left':
                    newTabPosition = currentTab.index;
                    break;
                case 'right':
                    newTabPosition = currentTab.index + 1;
                    break;
                case 'first':
                    newTabPosition = 0;
                    break;
                case 'last':
                    break;
                default:
                    newTabPosition = currentTab.index + 1 + state.chromelikeNewTabPosition;
                    state.chromelikeNewTabPosition++;
                    break;
            }
        }
        var createProperties = {
            url: url,
            active: message.tab.active,
            index: newTabPosition,
            pinned: message.tab.pinned,
            openerTabId: currentTab.id
        };
        if (message.tab.cookieStoreId) {
            createProperties.cookieStoreId = message.tab.cookieStoreId;
        }
        chrome.tabs.create(createProperties, function(tab) {
            if (message.scrollLeft || message.scrollTop) {
                tabMessages[tab.id] = {
                    scrollLeft: message.scrollLeft,
                    scrollTop: message.scrollTop
                };
            }
        });
    }

    self.openLink = function(message, sender, sendResponse) {
        var url = normalizeURL(message.url);
        if (url.startsWith("javascript:")) {
            sendTabMessage(sender.tab.id, 0, {
                subject: "showBanner",
                message: "JavaScript URLs are not allowed in such operation."
            });
        } else {
            if (message.tab.cookieStoreId) {
                if (browser.name !== "Firefox") {
                    delete message.tab.cookieStoreId;
                } else if (sender.tab && sender.tab.cookieStoreId === message.tab.cookieStoreId) {
                    delete message.tab.cookieStoreId;
                }
            }
            if (message.tab.cookieStoreId) {
                openUrlInNewTab(sender.tab, url, message);
            } else if (message.tab.tabbed) {
                if (sender.frameId !== 0 && chrome.runtime.getURL("pages/frontend.html") === sender.url
                    || !sender.tab) {
                    // if current call was made from Omnibar, the sender.tab may be stale,
                    // as sender was bound when port was created.
                    getActiveTab(function(tab) {
                        openUrlInNewTab(tab, url, message);
                    });
                } else {
                    openUrlInNewTab(sender.tab, url, message);
                }
            } else {
                chrome.tabs.update({
                    url: url,
                    pinned: message.tab.pinned || sender.tab.pinned
                }, function(tab) {
                    if (message.scrollLeft || message.scrollTop) {
                        tabMessages[tab.id] = {
                            scrollLeft: message.scrollLeft,
                            scrollTop: message.scrollTop
                        };
                    }
                });
            }
        }
    };
    /*
     * Open a URL in a new tab SPLIT with the sender's, so the two sit side by side.
     *
     * A split holds exactly two tabs, and what a request from a tab that is ALREADY
     * half of one should do is left to the browser: the create goes through as it
     * stands and whatever comes back -- another split, a refusal -- is what the user
     * gets, rather than a rule enforced here that the browser is free to change.
     *
     * Which means every outcome has to be reported, and as a banner in the page the
     * hint was pressed in: this action answers nothing, because nothing in the page
     * waits on it, so an operation that quietly did nothing would be indistinguishable
     * from a mapping that is not there.
     *
     * No `index` is sent. The two halves of a split are adjacent by definition, so
     * where the new tab lands is the browser's to decide, unlike openLink's
     * newTabPosition.
     */
    self.openSplitView = function(message, sender, sendResponse) {
        // Without a tab there is neither anything to split with nor anywhere to say so.
        if (!sender.tab) {
            return;
        }
        const complain = (text) => sendTabMessage(sender.tab.id, 0, {
            subject: "showBanner",
            message: text
        });
        if (!isSplitViewAvailable()) {
            complain("Split view is not supported by this browser.");
            return;
        }
        const url = normalizeURL(message.url || "");
        if (url.startsWith("javascript:")) {
            complain("JavaScript URLs are not allowed in such operation.");
            return;
        }
        try {
            chrome.tabs.create({
                url: url,
                active: message.active,
                openerTabId: sender.tab.id,
                splitWithTabId: sender.tab.id
            }, function() {
                if (chrome.runtime.lastError) {
                    complain(`Could not open a split view: ${chrome.runtime.lastError.message}`);
                }
            });
        } catch (e) {
            // A createProperties field the browser does not know THROWS rather than
            // being ignored, so a browser with tabs.createSplit but no splitWithTabId
            // arrives here instead of in the callback.
            complain(`Could not open a split view: ${e.message}`);
        }
    };
    /*
     * Point ONE named tab at a URL, leaving the focus where it is.
     *
     * `openLink` navigates the tab the caller sits in, or opens a new one; only the
     * background can address a tab it does not live in, so this is the way to
     * navigate a tab by id -- for the LLM chat's `open_url` when it reuses a tab it
     * opened and has already read, instead of leaving one behind per URL.
     *
     * Focus is deliberately untouched: the chat runs in an iframe of the tab the
     * user is on, and activating another tab detaches the frontend mid-answer.
     *
     * The tab is answered back as the browser reports it, because the caller has to
     * be able to say what happened rather than assume it, and every failure -- a
     * closed tab, a URL the browser refuses -- comes back as `error`: a throw here
     * would reach the caller as a timeout it cannot act on. Only http(s) is
     * accepted, so this cannot be turned into a way to run a `javascript:` URL in
     * someone else's tab.
     */
    self.navigateTab = function(message, sender, sendResponse) {
        const tabId = message.tabId;
        const url = normalizeURL(message.url || "");
        if (!Number.isInteger(tabId)) {
            _response(message, sendResponse, {
                error: "no tab id was given"
            });
            return;
        }
        if (!/^https?:\/\//i.test(url)) {
            _response(message, sendResponse, {
                error: `${message.url} is not an http(s) URL`
            });
            return;
        }
        try {
            chrome.tabs.update(tabId, {url: url}, function(tab) {
                if (chrome.runtime.lastError || !tab) {
                    _response(message, sendResponse, {
                        error: chrome.runtime.lastError ? chrome.runtime.lastError.message : "the tab did not answer"
                    });
                } else {
                    _response(message, sendResponse, {
                        tab: tab
                    });
                }
            });
        } catch (e) {
            _response(message, sendResponse, {
                error: e.message
            });
        }
    };
    self.viewSource = function(message, sender, sendResponse) {
        message.url = 'view-source:' + sender.tab.url;
        self.openLink(message, sender, sendResponse);
    };
}
