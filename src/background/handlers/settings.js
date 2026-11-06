import { NATIVE_LOCAL_PATH } from '../../common/utils.js';
import { readNativeSettings } from '../nativeSettings.js';
import { _save, request } from '../storage.js';

export default function registerSettings(bg) {
    const {self, browser, _response} = bg;
    const sendTabMessage = (...args) => bg.sendTabMessage(...args);
    const registerUserScript = (...args) => bg.registerUserScript(...args);
    bg.loadSettings = loadSettings;
    bg._updateAndPostSettings = _updateAndPostSettings;


    function loadSettings(keys, cb) {
        var tmpSet = {
            blocklist: {},
            marks: {},
            findHistory: [],
            cmdHistory: [],
            sessions: {},
            proxyMode: 'clear',
            autoproxy_hosts: [],
            proxy: []
        };

        browser.loadRawSettings(keys, function(set) {
            if (typeof(set.proxy) === "string") {
                set.proxy = [set.proxy];
                set.autoproxy_hosts = [set.autoproxy_hosts];
            }
            if (set.localPath) {
                readSnippets(set.localPath, function(resp) {
                    set.snippets = resp;
                    cb(set);
                }, function (reason) {
                    // The cached snippets stay in `set`, so the last copy read keeps
                    // working while the banner says what went wrong.
                    const from = set.localPath === NATIVE_LOCAL_PATH ? "~/.surfingkeys.js" : set.localPath;
                    set.error = "Failed to read snippets from " + from + (reason ? ": " + reason : "");
                    cb(set);
                });
            } else {
                cb(set);
            }
        }, tmpSet);
    }

    loadSettings(null, function(data) {
        browser._applyProxySettings(data);
    });

    function _updateSettings(diffSettings, afterSet) {
        diffSettings.savedAt = new Date().getTime();
        _save(chrome.storage.local, diffSettings, function() {
            _save(chrome.storage.sync, diffSettings, function() {
                if (chrome.runtime.lastError) {
                    var error = chrome.runtime.lastError.message;
                }
            });
            if (afterSet) {
                afterSet();
            }
        });
    }

    function _broadcastSettings(data) {
        chrome.tabs.query({}, function(tabs) {
            tabs.forEach(function(tab) {
                sendTabMessage(tab.id, -1, {
                    subject: 'settingsUpdated',
                    settings: data
                });
            });
        });
    }

    function _updateAndPostSettings(diffSettings, afterSet) {
        _broadcastSettings(diffSettings);
        _updateSettings(diffSettings, afterSet);
    }

    function getSenderUrl(sender) {
        // use the tab's url if sender is a frame with blank url.
        return (sender.frameId !== 0 && sender.url === "about:blank") ? sender.tab.url : sender.url;
    }
    function _getState(set, url, blocklistPattern, lurkingPattern) {
        if (set.blocklist['.*']) {
            return "disabled";
        }
        if (url) {
            if (set.blocklist[url.origin]) {
                return "disabled";
            }
            if (blocklistPattern) {
                blocklistPattern = new RegExp(blocklistPattern.source, blocklistPattern.flags);
                if (blocklistPattern.test(url.href)) {
                    return "disabled";
                }
            }
            if (lurkingPattern) {
                lurkingPattern = new RegExp(lurkingPattern.source, lurkingPattern.flags);
                if (lurkingPattern.test(url.href)) {
                    return "lurking";
                }
            }
        }
        return "enabled";
    }
    self.toggleBlocklist = function(message, sender, sendResponse) {
        loadSettings('blocklist', function(data) {
            var origin = ".*";
            var senderOrigin = sender.origin || new URL(getSenderUrl(sender)).origin;
            if (chrome.runtime.getURL("/").toLowerCase().indexOf(senderOrigin.toLowerCase()) !== 0 && senderOrigin !== "null") {
                origin = senderOrigin;
            }
            if (data.blocklist.hasOwnProperty(origin)) {
                delete data.blocklist[origin];
            } else {
                data.blocklist[origin] = 1;
            }
            _updateAndPostSettings({blocklist: data.blocklist}, function() {
                sendResponse({
                    state: _getState(data, sender.tab ? new URL(getSenderUrl(sender)) : null, message.blocklistPattern, message.lurkingPattern),
                    blocklist: data.blocklist,
                    url: origin
                });
            });
        });
    };
    self.toggleMouseQuery = function(message, sender, sendResponse) {
        loadSettings('mouseSelectToQuery', function(data) {
            if (sender.tab && sender.tab.url.indexOf(chrome.runtime.getURL("/")) !== 0) {
                var mouseSelectToQuery = data.mouseSelectToQuery || [];
                var idx = mouseSelectToQuery.indexOf(message.origin);
                if (idx === -1) {
                    mouseSelectToQuery.push(message.origin);
                } else {
                    mouseSelectToQuery.splice(idx, 1);
                }
                _updateAndPostSettings({mouseSelectToQuery: mouseSelectToQuery});
            }
        });
    };
    self.getState = function(message, sender, sendResponse) {
        loadSettings(['blocklist', 'noPdfViewer', 'proxyMode', 'proxy'], function(data) {
            if (sender.tab) {
                _response(message, sendResponse, {
                    noPdfViewer: data.noPdfViewer,
                    proxyMode: data.proxyMode,
                    proxy: data.proxy,
                    state: _getState(data, new URL(getSenderUrl(sender)), message.blocklistPattern, message.lurkingPattern)
                });
            }
        });
    };

    function appendNonce(url) {
        if (/https?:\/\//.test(url)) {
            url = url.replace(/\?$/, "");
            let u = new URL(url);
            let con = u.search ? "&" : "?";
            url = `${url}${con}nonce=${new Date().getTime()}`;
        }
        return url;
    }

    // Reads the snippets `localPath` points at, from the native app's file or from a
    // URL. onException always gets a string, because it travels over sendMessage,
    // which turns an Error into an empty object.
    function readSnippets(localPath, onReady, onException) {
        if (localPath === NATIVE_LOCAL_PATH) {
            readNativeSettings(onReady, onException);
        } else {
            request(appendNonce(localPath), onReady, undefined, undefined, function(exp) {
                onException(exp && exp.message ? exp.message : String(exp));
            });
        }
    }

    function _loadSettingsFromUrl(url, cb) {
        readSnippets(url, function(resp) {
            _updateAndPostSettings({localPath: url, snippets: resp});
            registerUserScript(resp, () => {
                cb({status: "Succeeded", snippets: resp});
            });
        }, function (reason) {
            cb({status: "Failed", error: reason});
        });
    };

    self.resetSettings = function(message, sender, sendResponse) {
        chrome.storage.local.clear();
        chrome.storage.sync.clear();
        loadSettings(null, function(data) {
            browser._applyProxySettings(data);
            _response(message, sendResponse, {
                settings: data
            });
            _broadcastSettings(data);
        });
    };
    self.loadSettingsFromUrl = function(message, sender, sendResponse) {
        _loadSettingsFromUrl(message.url, function(status) {
            _response(message, sendResponse, status);
        });
    };
    self.localData = function(message, sender, sendResponse) {
        if (message.data.constructor === Object) {
            chrome.storage.local.set(message.data, function() {
            });
            // broadcast the change also, such as lastKeys
            // we would set lastKeys in sync to avoid breaching chrome.storage.sync.MAX_WRITE_OPERATIONS_PER_MINUTE
            _broadcastSettings(message.data);
        } else {
            // string or array of string keys
            chrome.storage.local.get(message.data, function(data) {
                _response(message, sendResponse, {
                    data: data
                });
            });
        }
    };
}
