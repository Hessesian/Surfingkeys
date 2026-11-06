import { setNativeHost } from './nativeSettings.js';
import { _save, dictFromArray, extendObject, getSubSettings } from './storage.js';
import registerFrames from './handlers/frames.js';
import registerBookmarks from './handlers/bookmarks.js';
import registerSettings from './handlers/settings.js';
import registerLlmBridge from './handlers/llmBridge.js';
import registerTabEvents from './handlers/tabEvents.js';
import registerMarks from './handlers/marks.js';
import registerHistory from './handlers/history.js';
import registerTabs from './handlers/tabs.js';
import registerTabNav from './handlers/tabNav.js';
import registerWindows from './handlers/windows.js';
import registerNavigation from './handlers/navigation.js';
import registerUserScripts from './handlers/userScripts.js';
import registerMisc from './handlers/misc.js';
import registerSessions from './handlers/sessions.js';
import registerDownloads from './handlers/downloads.js';
import registerProxy from './handlers/proxy.js';

function start(browser) {
    var self = {};

    // Claimed before the first settings load (registerSettings), so even that read goes
    // over the editor's connection.
    setNativeHost(browser.nvimServer || null);

    const isMV3 = chrome.runtime.getManifest().manifest_version === 3;

    // Mutable state shared by several handler modules. A module cannot reassign a
    // variable of another module's scope, so whatever is reassigned lives on this one
    // object, and every module reads it through `state.` at call time.
    const state = {
        tabHistory: [],
        tabHistoryIndex: 0,
        chromelikeNewTabPosition: 0,
        historyTabAction: false,
        llmProvidersFromSnippets: false,
        _queueURLs: []
    };


    // data by tab id
    var tabActivated = {},
        tabMessages = {},
        tabURLs = {},
        tabIconStatus = {};


    var newTabUrl = browser._setNewTabUrl();

    var conf = {
        llm: { },
        focusAfterClosed: "right",
        tabsMRUOrder: true,
        newTabPosition: 'default',
        showTabIndices: false,
        interceptedErrors: []
    };

    self.pendingPorts = [];
    function _response(message, sendResponse, result) {
        var idx = self.pendingPorts.indexOf(message);
        if (idx !== -1) {
            self.pendingPorts.splice(idx, 1);
        }
        sendResponse(result);
    }
    function handleMessage(_message, _sender, _sendResponse) {
        if (self.hasOwnProperty(_message.action)) {
            var result = self[_message.action](_message, _sender, _sendResponse);
            if (_message.needResponse) {
                if (result) {
                    _sendResponse(result);
                    _message.needResponse = false;
                } else {
                    self.pendingPorts.push(_message);
                    // An asynchronous response will be sent using sendResponse later.
                }
                return _message.needResponse;
            }
        } else {
            console.log("[unexpected runtime message] " + JSON.stringify(_message));
        }
    }

    // The scope the handler modules share: what any of them reads from another's
    // territory. Functions one module defines for another are added by that module
    // when it registers, and called through `bg.` at call time.
    const bg = {browser, self, conf, isMV3, newTabUrl, tabActivated, tabMessages, tabURLs, tabIconStatus, _response, state};

    // Order matters where a module runs something while registering: registerSettings
    // starts the first settings load, registerLlmBridge the stored-providers read, and
    // registerTabEvents adds the chrome.tabs listeners.
    [
        registerFrames,
        registerBookmarks,
        registerSettings,
        registerLlmBridge,
        registerTabEvents,
        registerMarks,
        registerHistory,
        registerTabs,
        registerTabNav,
        registerWindows,
        registerNavigation,
        registerUserScripts,
        registerMisc,
        registerSessions,
        registerDownloads,
        registerProxy
    ].forEach((register) => register(bg));

    chrome.runtime.onMessage.addListener(handleMessage);
    if (isMV3) {
        chrome.runtime.onUserScriptMessage.addListener((m, s, r) => {
            m.fromUserScript = true;
            // Returned, so that an action answering later (getChannelScope asks the
            // sender's frame, request waits on the network) still has an open
            // channel to answer on.
            return handleMessage(m, s, r);
        });
        chrome.runtime.onInstalled.addListener((e) => {
            chrome.userScripts.configureWorld({
                csp: 'script-src \'self\' \'unsafe-eval\'',
                messaging: true
            });
        });
    }


    self.getContainerName = browser._getContainerName(self, _response);
    self.getContainers = browser._getContainers ? browser._getContainers(self, _response) : function(message, sender, sendResponse) {
        _response(message, sendResponse, { containers: [] });
    };
    chrome.runtime.setUninstallURL("http://brookhong.github.io/2018/01/30/why-did-you-uninstall-surfingkeys.html");
}

export {
    _save,
    dictFromArray,
    extendObject,
    getSubSettings,
    start
};
