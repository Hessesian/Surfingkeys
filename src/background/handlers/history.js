import { filterByTitleOrUrl } from '../../common/utils.js';

export default function registerHistory(bg) {
    const {self, browser, _response} = bg;
    const loadSettings = (...args) => bg.loadSettings(...args);
    const _updateAndPostSettings = (...args) => bg._updateAndPostSettings(...args);
    bg._filterByTitleOrUrl = _filterByTitleOrUrl;

    /*
     * The tabs worth listing, filtered by the caller's query.
     *
     * A tab whose navigation has not committed yet reports no `url` at all -- its
     * destination is in `pendingUrl` -- and it is dropped by default, because a list
     * a person picks a tab from has nothing to show for it.
     *
     * `includeLoading` keeps it, for a caller that is looking for precisely the tab
     * that was opened a moment ago rather than choosing among the ones already there:
     * the LLM chat identifies the tab its `open_url` created by that tab being NEW to
     * the list, so while it cannot be seen the chat cannot put it in its tab group or
     * read it back either, and how long that lasts is decided by how fast the site
     * answers.
     *
     * Such a tab has no title and no `url` for a query to match, so the destination
     * stands in for both -- admitting it and then matching it on nothing would drop
     * every loading tab again the moment a caller passed a filter. The match itself
     * still goes through the shared `filterByTitleOrUrl`, on a projection of the
     * tabs, so the two cannot answer differently.
     */
    function _filterByTitleOrUrl(tabs, query, includeLoading) {
        tabs = tabs.filter(function(b) {
            return b.url || (includeLoading && b.pendingUrl);
        });
        if (!includeLoading) {
            return filterByTitleOrUrl(tabs, query, false);
        }
        const matchable = tabs.map(function(b) {
            return {tab: b, title: b.title, url: b.url || b.pendingUrl};
        });
        return filterByTitleOrUrl(matchable, query, false).map(function(m) {
            return m.tab;
        });
    }
    self.getRecentlyClosed = function(message, sender, sendResponse) {
        chrome.sessions.getRecentlyClosed({}, function(sessions) {
            var tabs = [];
            for (var i = 0; i < sessions.length; i ++) {
                var s = sessions[i];
                if (s.hasOwnProperty('window')) {
                    tabs = tabs.concat(s.window.tabs);
                } else if (s.hasOwnProperty('tab')) {
                    tabs.push(s.tab);
                }
            }
            tabs = _filterByTitleOrUrl(tabs, message.query);
            _response(message, sendResponse, {
                urls: tabs
            });
        });
    };
    self.getTopSites = function(message, sender, sendResponse) {
        if (chrome.topSites) {
            chrome.topSites.get(function(urls) {
                urls = _filterByTitleOrUrl(urls, message.query);
                _response(message, sendResponse, {
                    urls: urls
                });
            });
        } else {
            _response(message, sendResponse, {
                urls: []
            });
        }
    };


    function _getHistory(text, maxResults, cb, sortByMostUsed) {
        browser.getLatestHistoryItem(text, maxResults, (items) => {
            if (sortByMostUsed) {
                items = items.sort(function(a, b) {
                    return b.visitCount - a.visitCount;
                });
            }
            cb(items);
        });
    }
    self.getAllURLs = function(message, sender, sendResponse) {
        chrome.bookmarks.search(message.query || {}, function(bmItems) {
            var urls = bmItems,
                requestCount = message.maxResults || 100;
            var maxResults = requestCount - urls.length;
            if (maxResults > 0) {
                _getHistory(message.query || "", maxResults,  function(historyItems) {
                    urls = urls.concat(historyItems);
                    _response(message, sendResponse, {
                        urls: urls
                    });
                }, true);
            } else {
                _response(message, sendResponse, {
                    urls: urls.slice(0, requestCount)
                });
            }
        });
    };
    self.getHistory = function(message, sender, sendResponse) {
        _getHistory(message.query || "", message.maxResults || 100, function(tree) {
            _response(message, sendResponse, {
                history: tree
            });
        }, message.sortByMostUsed);
    };
    self.addHistories = function(message, sender, sendResponse) {
        message.history.forEach(h => {
            chrome.history.addUrl({url: h});
        });
    };
    self.getTopURL = function(message, sender, sendResponse) {
        return {
            url: sender.tab ? sender.tab.url : ""
        };
    };
    function _removeURL(uid, cb) {
        var type = uid[0], uid = uid.substr(1);
        if (type === 'B') {
            chrome.bookmarks.remove(uid, cb);
        } else if (type === 'H') {
            chrome.history.deleteUrl({url: uid}, cb);
        } else if (type === 'T') {
            uid = uid.split(":").map(function(u) {
                return parseInt(u);
            });
            chrome.windows.update(uid[0], {
                focused: true
            }, function() {
                chrome.tabs.remove(uid[1], cb);
            });
        } else if (type === 'M') {
            loadSettings('marks', function(data) {
                delete data.marks[uid];
                _updateAndPostSettings({marks: data.marks}, cb);
            });
        }
    }
    self.removeURL = function(message, sender, sendResponse) {
        var removed = 0,
            totalToRemoved = message.uid.length,
            uid = message.uid;
        if (typeof(message.uid) === "string") {
            totalToRemoved = 1;
            uid = [ message.uid ];
        }
        function _done() {
            removed ++;
            if (removed === totalToRemoved) {
                _response(message, sendResponse, {
                    response: "Done"
                });
            }
        }
        uid.forEach(function(u) {
            _removeURL(u, _done);
        });

    };
    self.deleteHistoryOlderThan = function(message, sender, sendResponse) {
        var days = message.days || 0, hours = message.hours || 0;
        chrome.history.deleteRange({
            startTime: 0,
            endTime: new Date().getTime() - (days * 86400 + hours * 3600) * 1000
        }, function() {
        });
    };
}
