export default function registerTabEvents(bg) {
    const {browser, conf, tabActivated, tabMessages, tabURLs, tabIconStatus, state} = bg;
    const updateProxy = (...args) => bg.updateProxy(...args);
    bg.sendTabMessage = sendTabMessage;
    bg.getActiveTab = getActiveTab;
    bg._setScrollPos_bg = _setScrollPos_bg;


    function removeTab(tabId) {
        delete tabActivated[tabId];
        delete tabMessages[tabId];
        delete tabURLs[tabId];
        delete tabIconStatus[tabId];
        state.tabHistory = state.tabHistory.filter(function(e) {
            return e !== tabId;
        });
        if (state._queueURLs.length) {
            chrome.tabs.create({
                active: false,
                url: state._queueURLs.shift()
            });
        }

        _updateTabIndices();
    }
    chrome.tabs.onRemoved.addListener(removeTab);
    function _setScrollPos_bg(tabId) {
        if (tabMessages.hasOwnProperty(tabId)) {
            const message = tabMessages[tabId];
            sendTabMessage(tabId, 0, {
                subject: "setScrollPos",
                scrollLeft: message.scrollLeft,
                scrollTop: message.scrollTop
            });
            delete tabMessages[tabId];
        }
    }

    function sendTabMessage(tabId, frameId, message) {
        const opts = (frameId === -1) ? undefined : {frameId: frameId};
        // use catch to suppress Uncaught (in promise) Error on sending message to unsupported tabs like chrome://
        const p = chrome.tabs.sendMessage(tabId, message, opts);
        if (p) {
            p.catch((e) => {});
        }
    }
    var _lastActiveTabId = null;
    function _tabActivated(tabId) {
        if (_lastActiveTabId !== tabId) {
            if (_lastActiveTabId !== null) {
                sendTabMessage(_lastActiveTabId, 0, {
                    subject: 'tabDeactivated'
                });
            }
            sendTabMessage(tabId, 0, {
                subject: 'tabActivated'
            });
            _lastActiveTabId = tabId;
        }
    }
    chrome.tabs.onUpdated.addListener(function (tabId, changeInfo, tab) {
        if (changeInfo.status === "complete") {
            if (tab.active) {
                _tabActivated(tabId);
            }
        }
        if (browser.detectTabTitleChange && changeInfo.title) {
            sendTabMessage(tabId, 0, {
                subject: 'titleChanged',
                changeInfo
            });
        }
    });
    chrome.windows.onFocusChanged.addListener(function(w) {
        getActiveTab(function(tab) {
            _tabActivated(tab.id);
        });
    });

    chrome.tabs.onCreated.addListener(function(tab) {
        _updateTabIndices();
    });
    chrome.tabs.onMoved.addListener(function() {
        _updateTabIndices();
    });
    chrome.tabs.onActivated.addListener(function(activeInfo) {
        if (!state.historyTabAction && activeInfo.tabId != state.tabHistory[state.tabHistory.length - 1]) {
            if (state.tabHistory.length > 10) {
                state.tabHistory.shift();
            }
            if (state.tabHistoryIndex != state.tabHistory.length - 1) {
                state.tabHistory.splice(state.tabHistoryIndex + 1, state.tabHistory.length - 1);
            }
            state.tabHistory.push(activeInfo.tabId);
            state.tabHistoryIndex = state.tabHistory.length - 1;
        }
        tabActivated[activeInfo.tabId] = new Date().getTime();
        _tabActivated(activeInfo.tabId);
        state.historyTabAction = false;
        state.chromelikeNewTabPosition = 0;

        _updateTabIndices();
    });
    chrome.tabs.onDetached.addListener(function() {
        _updateTabIndices();
    });
    chrome.tabs.onAttached.addListener(function() {
        _updateTabIndices();
    });

    function getActiveTab(cb) {
        chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
            tabs.length > 0 && cb(tabs[0]);
        });
    }
    chrome.commands.onCommand.addListener(function(command) {
        switch (command) {
            case 'restartext':
                chrome.tabs.query({}, function(tabs) {
                    tabs.forEach(function(tab) {
                        chrome.tabs.reload(tab.id);
                    });
                    chrome.runtime.reload();
                });
                break;
            case 'previousTab':
            case 'nextTab':
                getActiveTab(function(tab) {
                    var index = (command === 'previousTab') ? tab.index - 1 : tab.index + 1;
                    chrome.tabs.query({ windowId: tab.windowId }, function(tabs) {
                        index = ((index % tabs.length) + tabs.length) % tabs.length;
                        chrome.tabs.update(tabs[index].id, { active: true });
                    });
                });
                break;
            case 'closeTab':
                getActiveTab(function(tab) {
                    chrome.tabs.remove(tab.id);
                });
                break;
            case 'proxyThis':
                getActiveTab(function(tab) {
                    var host = new URL(tab.url || tab.pendingUrl).host;
                    updateProxy({
                        host: host,
                        operation: "toggle"
                    }, function() {
                        chrome.tabs.reload(tab.id, {
                            bypassCache: true
                        });
                    });
                });
                break;
            default:
                break;
        }
    });

    function _updateTabIndices() {
        if (conf.showTabIndices) {
            chrome.tabs.query({currentWindow: true}, function(tabs) {
                tabs.forEach(function(tab) {
                    sendTabMessage(tab.id, 0, {
                        subject: "tabIndexChange",
                        index: tab.index + 1
                    });
                });
            });
        }
    }
}
