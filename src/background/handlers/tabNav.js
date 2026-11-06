import { NATIVE_HOST_NAME } from '../../common/utils.js';

export default function registerTabNav(bg) {
    const {self, browser, conf, _response} = bg;
    const getActiveTab = (...args) => bg.getActiveTab(...args);

    // limit to between 0 and length
    function _fixTo(to, length) {
        if (to < 0) {
            to = 0;
        } else if (to >= length){
            to = length;
        }
        return to;
    }
    // round base ahead if repeats reaches length
    function _roundBase(base, repeats, length) {
        if (repeats > length - base) {
            base -= repeats - (length - base);
        }
        return base;
    }
    function _nextTab(tab, step) {
        if (tab) {
            chrome.tabs.query({
                windowId: tab.windowId
            }, function(tabs) {
                if (tab.index == 0 && step == -1) {
                    step = tabs.length -1 ;
                } else if (tab.index == tabs.length -1 && step == 1 ) {
                    step = 1 - tabs.length ;
                }
                var to = _fixTo(tab.index + step, tabs.length - 1);
                chrome.tabs.update(tabs[to].id, {
                    active: true
                });
            });
        } else {
            getActiveTab(function(t) {
                _nextTab(t, step);
            });
        }
    }
    self.nextTab = function(message, sender, sendResponse) {
        _nextTab(sender.tab, message.repeats);
    };
    self.previousTab = function(message, sender, sendResponse) {
        _nextTab(sender.tab, -message.repeats);
    };
    function _roundRepeatTabs(tab, repeats, operation) {
        if (tab) {
            chrome.tabs.query({
                windowId: tab.windowId
            }, function(tabs) {
                var tabIds = tabs.map(function(e) {
                    return e.id;
                });
                repeats = _fixTo(repeats, tabs.length);
                var base = _roundBase(tab.index, repeats, tabs.length);
                operation(tabIds.slice(base, base + repeats));
            });
        } else {
            getActiveTab(function(t) {
                _roundRepeatTabs(t, repeats, operation);
            });
        }
    }
    self.reloadTab = function(message, sender, sendResponse) {
        _roundRepeatTabs(sender.tab, message.repeats, function(tabIds) {
            tabIds.forEach(function(tabId) {
                chrome.tabs.reload(tabId, {
                    bypassCache: message.nocache
                });
            });
        });
    };
    self.closeTab = function(message, sender, sendResponse) {
        _roundRepeatTabs(sender.tab, message.repeats, function(tabIds) {
            chrome.tabs.remove(tabIds, function() {
                if ( conf.focusAfterClosed === "left" ) {
                    _nextTab(sender.tab, -1);
                } else if ( conf.focusAfterClosed === "last" ) {
                    self.historyTab({backward: true});
                }
            });
        });
    };

    function _closeTab(s, n) {
        chrome.tabs.query({currentWindow: true}, function(tabs) {
            tabs = tabs.map(function(e) { return e.id; });
            chrome.tabs.remove(tabs.slice(s.tab.index + (n < 0 ? n : 1),
                                          s.tab.index + (n < 0 ? 0 : 1 + n)));
        });
    };

    self.closeTabLeft  = function(message, sender, senderResponse) { _closeTab(sender, -message.repeats);};
    self.closeTabRight = function(message, sender, senderResponse) { _closeTab(sender, message.repeats); };
    self.closeTabsToLeft = function(message, sender, senderResponse) { _closeTab(sender, -sender.tab.index); };
    self.closeTabsToRight = function(message, sender, senderResponse) {
        chrome.tabs.query({currentWindow: true},
                          function(tabs) { _closeTab(sender, tabs.length - sender.tab.index); });
    };
    self.tabOnly = function(message, sender, sendResponse) {
        chrome.tabs.query({currentWindow: true}, function(tabs) {
            tabs = tabs.filter(function(t) {
                return t.id != sender.tab.id && !t.pinned;
            }).map(function(t) { return t.id });
            chrome.tabs.remove(tabs);
        });
    };

    self.closeAudibleTab = function(message, sender, sendResponse) {
        chrome.tabs.query({audible: true}, function(tabs) {
            if (tabs) {
                chrome.tabs.remove(tabs[0].id)
            }
        });
    };
    self.muteTab = function(message, sender, sendResponse) {
        var tab = sender.tab;
        chrome.tabs.update(tab.id, {
            muted: ! tab.mutedInfo.muted
        });
    };
    self.openLast = function(message, sender, sendResponse) {
        if (browser.name === "Safari") {
            chrome.runtime.sendNativeMessage(NATIVE_HOST_NAME, {command: "reopenLastTab"}, function(response) {
                _response(message, sendResponse, response);
            });
        } else {
            chrome.sessions.restore();
        }
    };
    self.duplicateTab = function(message, sender, sendResponse) {
        chrome.tabs.duplicate(sender.tab.id, function() {
            if (message.active === false) {
                chrome.tabs.update(sender.tab.id, { active: true });
            }
        });
    };
    self.moveTab = function(message, sender, sendResponse) {
        chrome.tabs.query({
            windowId: sender.tab.windowId
        }, function(tabs) {
            var to = _fixTo(sender.tab.index + message.step * message.repeats, tabs.length);
            chrome.tabs.move(sender.tab.id, {
                index: to
            });
        });
    };
}
