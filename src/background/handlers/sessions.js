export default function registerSessions(bg) {
    const {self, newTabUrl} = bg;
    const loadSettings = (...args) => bg.loadSettings(...args);
    const _updateAndPostSettings = (...args) => bg._updateAndPostSettings(...args);

    function _quit() {
        chrome.windows.getAll({
            populate: false
        }, function(windows) {
            windows.forEach(function(w) {
                chrome.windows.remove(w.id);
            });
        });
    }
    self.quit = function(message, sender, sendResponse) {
        _quit();
    };
    self.createSession = function(message, sender, sendResponse) {
        loadSettings('sessions', function(data) {
            chrome.tabs.query({}, function(tabs) {
                var tabGroup = {};
                tabs.forEach(function(tab) {
                    if (tab && tab.index !== void 0) {
                        if (!tabGroup.hasOwnProperty(tab.windowId)) {
                            tabGroup[tab.windowId] = [];
                        }
                        if (tab.url !== newTabUrl) {
                            tabGroup[tab.windowId].push(tab.url);
                        }
                    }
                });
                var tabg = [];
                for (var k in tabGroup) {
                    if (tabGroup[k].length) {
                        tabg.push(tabGroup[k]);
                    }
                }
                data.sessions[message.name] = {};
                data.sessions[message.name]['tabs'] = tabg;
                _updateAndPostSettings({
                    sessions: data.sessions
                }, (message.quitAfterSaved ? _quit : undefined));
            });
        });
    };
    self.openSession = function(message, sender, sendResponse) {
        loadSettings('sessions', function(data) {
            if (data.sessions.hasOwnProperty(message.name)) {
                var urls = data.sessions[message.name]['tabs'];
                urls[0].forEach(function(url) {
                    chrome.tabs.create({
                        url: url,
                        active: false,
                        pinned: false
                    });
                });
                for (var i = 1; i < urls.length; i++) {
                    var a = urls[i];
                    chrome.windows.create({}, function(win) {
                        a.forEach(function(url) {
                            chrome.tabs.create({
                                windowId: win.id,
                                url: url,
                                active: false,
                                pinned: false
                            });
                        });
                    });
                }
                chrome.tabs.query({
                    url: newTabUrl
                }, function(tabs) {
                    chrome.tabs.remove(tabs.map(function(t) {
                        return t.id;
                    }));
                });
            }
        });
    };
    self.deleteSession = function(message, sender, sendResponse) {
        loadSettings('sessions', function(data) {
            delete data.sessions[message.name];
            _updateAndPostSettings({
                sessions: data.sessions
            });
        });
    };
}
