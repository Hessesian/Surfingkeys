export default function registerTabs(bg) {
    const {self, conf, tabActivated, tabURLs, _response, state} = bg;
    const getActiveTab = (...args) => bg.getActiveTab(...args);
    const _setScrollPos_bg = (...args) => bg._setScrollPos_bg(...args);
    const _filterByTitleOrUrl = (...args) => bg._filterByTitleOrUrl(...args);
    bg.focusTab = focusTab;

    self.getTabs = function(message, sender, sendResponse) {
        var tab = sender.tab;
        var queryInfo = message.queryInfo || {};
        chrome.tabs.query(queryInfo, function(tabs) {
            tabs = _filterByTitleOrUrl(tabs, message.filter, message.includeLoading);
            if (tabs.length > message.tabsThreshold && conf.tabsMRUOrder) {
                // only remove current tab when tabsMRUOrder is enabled.
                tabs = tabs.filter(function(b) {
                    return b.id !== tab.id;
                });
                tabs.sort(function(x, y) {
                    // Shift tabs without "last access" data to the end
                    var a = x.lastAccessed || tabActivated[x.id];
                    var b = y.lastAccessed || tabActivated[y.id];

                    if (!isFinite(a) && !isFinite(b)) {
                        return 0;
                    }

                    if (!isFinite(a)) {
                        return 1;
                    }

                    if (!isFinite(b)) {
                        return -1;
                    }

                    return b - a;
                });
            }
            _response(message, sendResponse, {
                tabs: tabs
            });
        });
    };
    /*
     * Group tabs, by default the sender's own. `tabIds` names others instead, for
     * a caller that grouped what it listed rather than where it sits -- the LLM
     * chat's `group_tabs`, which is also why this answers with the group it made:
     * a tool that reports "done" without reading back what happened is a tool the
     * model can claim success for on nothing.
     *
     * `chrome.tabGroups` is absent on some browsers (see getTabGroups below), and
     * a group cannot span windows, so both are reported rather than thrown -- a
     * throw in the background reaches a caller as a timeout it cannot act on.
     */
    self.createTabGroup = function(message, sender, sendResponse) {
        if (!chrome.tabGroups) {
            _response(message, sendResponse, {
                error: "tab groups are not supported by this browser"
            });
            return;
        }
        const tabIds = Array.isArray(message.tabIds) && message.tabIds.length > 0
            ? message.tabIds
            : [sender.tab.id];
        chrome.tabs.group({tabIds: tabIds, groupId: message.groupId}, function(groupId) {
            if (chrome.runtime.lastError || groupId === undefined) {
                _response(message, sendResponse, {
                    error: chrome.runtime.lastError ? chrome.runtime.lastError.message : "no group was created"
                });
                return;
            }
            const done = () => _response(message, sendResponse, {
                groupId: groupId,
                tabIds: tabIds
            });
            if (message.title || message.color) {
                chrome.tabGroups.update(groupId, {
                    title: message.title,
                    color: message.color
                }, done);
            } else {
                done();
            }
        });
    };
    self.ungroupTab = function(message, sender, sendResponse) {
        chrome.tabs.ungroup([sender.tab.id]);
    };
    self.collapseGroup = function(message, sender, sendResponse) {
        chrome.tabGroups.update(message.groupId, {collapsed: message.collapsed});
    };
    self.getTabGroups = function(message, sender, sendResponse) {
        chrome.tabGroups.query({}, function(groups) {
            let activeGroup = -1;
            // retrieve all tabs of each group
            chrome.tabs.query({}, function(tabs) {
                const tabsInGroup = {};
                tabs.forEach(function(tab) {
                    if (tab.groupId && tab.groupId !== (chrome.tabGroups?.TAB_GROUP_ID_NONE ?? -1)) {
                        if (!tabsInGroup[tab.groupId]) {
                            tabsInGroup[tab.groupId] = [];
                        }
                        if (tab.id === sender.tab.id) {
                            activeGroup = tab.groupId;
                        }
                        tabsInGroup[tab.groupId].push({
                            id: tab.id,
                            title: tab.title,
                            url: tab.url,
                            favIconUrl: tab.favIconUrl,
                            active: tab.active,
                            index: tab.index
                        });
                    }
                });

                groups = groups.filter((g) => !g.hermit);
                groups.forEach(function(group) {
                    group.tabs = tabsInGroup[group.id] || [];
                    group.active = group.id === activeGroup;
                });

                _response(message, sendResponse, {
                    groups: groups
                });
            });
        });
    };
    self.togglePinTab = function(message, sender, sendResponse) {
        getActiveTab(function(tab) {
            return chrome.tabs.update(tab.id, {
                pinned: !tab.pinned
            });
        });
    };
    self.closeTabByIds = function(message, sender, sendResponse) {
        chrome.tabs.remove(message.tabIds);
    };
    function focusTab(windowId, tabId) {
        chrome.windows.update(windowId, {
            focused: true
        }, function() {
            chrome.tabs.update(tabId, {
                active: true
            });
        });
    }
    self.focusTab = function(message, sender, sendResponse) {
        if (message.windowId !== undefined && sender.tab.windowId !== message.windowId) {
            focusTab(message.windowId, message.tabId);
        } else {
            chrome.tabs.update(message.tabId, {
                active: true
            });
        }
    };
    self.focusTabByIndex = function(message, sender, sendResponse) {
        var queryInfo = message.queryInfo || {currentWindow: true};
        chrome.tabs.query(queryInfo, function(tabs) {
            const position = message.last ? tabs.length : message.repeats;
            if (position > 0 && position <= tabs.length) {
                chrome.tabs.update(tabs[position - 1].id, {
                    active: true
                });
            }
        });
    };
    self.goToLastTab = function(message, sender, sendResponse) {
        if (state.tabHistory.length > 1) {
            var lastTab = state.tabHistory[state.tabHistory.length - 2];
            chrome.tabs.update(lastTab, {
                active: true
            });
        }
    };
    self.historyTab = function(message, sender, sendResponse) {
        if (state.tabHistory.length > 0) {
            state.historyTabAction = true;
            if (message.hasOwnProperty("index")) {
                state.tabHistoryIndex = (parseInt(message.index) + state.tabHistory.length) % state.tabHistory.length;
            } else {
                state.tabHistoryIndex += message.backward ? -1 : 1;
                if (state.tabHistoryIndex < 0) {
                    state.tabHistoryIndex = 0;
                } else if (state.tabHistoryIndex >= state.tabHistory.length) {
                    state.tabHistoryIndex = state.tabHistory.length - 1;
                }
            }
            const tabId = state.tabHistory[state.tabHistoryIndex];
            chrome.tabs.update(tabId, {
                active: true
            });
        }
    };
    self.tabURLAccessed = function(message, sender, sendResponse) {
        if (sender.tab) {
            var tabId = sender.tab.id;
            _setScrollPos_bg(tabId);
            if (!tabURLs.hasOwnProperty(tabId)) {
                tabURLs[tabId] = {};
            }
            tabURLs[tabId][message.url] = message.title;
            return {
                active: sender.tab.active,
                index: conf.showTabIndices ? sender.tab.index + 1 : 0
            };
        } else {
            return {};
        }
    };
    self.getTabURLs = function(message, sender, sendResponse) {
        var tabURL = tabURLs[sender.tab.id] || {};
        tabURL = Object.keys(tabURL).map(function(u) {
            return {
                url: u,
                title: tabURL[u]
            };
        });
        return {
            urls: tabURL
        };
    };
}
