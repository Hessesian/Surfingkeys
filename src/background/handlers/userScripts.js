import { _persistLlmProviderConfig, _registerLlmProviders } from '../llmProviders.js';

export default function registerUserScripts(bg) {
    const {self, browser, conf, isMV3, _response, state} = bg;
    const loadSettings = (...args) => bg.loadSettings(...args);
    const _updateAndPostSettings = (...args) => bg._updateAndPostSettings(...args);
    bg.registerUserScript = registerUserScript;
    bg.isSplitViewAvailable = isSplitViewAvailable;

    function registerUserScript(snippets, callback) {
        if (!isUserScriptsAvailable()) {
            callback && callback();
            return;
        }
        const userScriptId = "settingsSnippets";
        const invokeCallback = () => {
            if (chrome.runtime.lastError) {
                console.error("userScripts API error:", chrome.runtime.lastError);
            }
            callback && callback();
        };
        if (snippets) {
            chrome.userScripts.getScripts({ids:[userScriptId]}, (r) => {
                if (chrome.runtime.lastError) {
                    console.error("userScripts.getScripts error:", chrome.runtime.lastError);
                    callback && callback();
                    return;
                }
                const code = `import('./api.js').then((module) => {module.default("${chrome.runtime.getURL("/")}", (api, settings) => {${snippets}\n})});`;
                const registerSettingSnippets = () => {
                    chrome.userScripts.register([{
                        allFrames: true,
                        id: userScriptId,
                        matches: ['*://*/*', 'file:///*'],
                        js: [{code}],
                        runAt: "document_start"
                    }], invokeCallback);
                };
                if (r.length > 0) {
                    if (r[0].js[0].code !== code) {
                        chrome.userScripts.unregister({ids:[userScriptId]}, registerSettingSnippets);
                    } else {
                        callback && callback();
                    }
                } else {
                    registerSettingSnippets();
                }
            });
        } else {
            chrome.userScripts.getScripts({ids:[userScriptId]}, (r) => {
                if (chrome.runtime.lastError) {
                    console.error("userScripts.getScripts error:", chrome.runtime.lastError);
                    callback && callback();
                    return;
                }
                if (r.length > 0) {
                    chrome.userScripts.unregister({ids:[userScriptId]}, invokeCallback);
                } else {
                    callback && callback();
                }
            });
        }
    }

    function onFullSettingsRequested(data, callback) {
        data.isMV3 = isMV3;
        // `ready`, not `instance`: a pending connection may have no host behind it. A
        // boolean, because a content script receives a promise as a truthy empty
        // object.
        data.useNeovim = !!(browser.nvimServer && browser.nvimServer.ready);
        data.isUserScriptsAvailable = isUserScriptsAvailable();
        // Sent so a page can decide whether the split-view mapping exists at all,
        // which only the background can answer: a content script cannot see
        // chrome.tabs.
        data.isSplitViewAvailable = isSplitViewAvailable();
        if (isMV3) {
            data.showAdvanced = data.isUserScriptsAvailable && data.showAdvanced;
        }

        if (data.isUserScriptsAvailable && data.showAdvanced) {
            registerUserScript(data.snippets, callback);
        } else if (data.isUserScriptsAvailable) {
            registerUserScript(null, callback);
        } else {
            callback && callback();
        }
    }
    self.getSettings = function(message, sender, sendResponse) {
        var pf = loadSettings;
        if (message.key === "RAW") {
            pf = browser.loadRawSettings;
            message.key = "";
        }
        pf(message.key, function(data) {
            if (message.key === undefined) {
                onFullSettingsRequested(data);
            }

            _response(message, sendResponse, {
                settings: data
            });
        });
    };
    function isUserScriptsAvailable() {
        try {
            if (chrome.userScripts) {
                return true;
            }
        } catch {
            return false;
        }
        return false;
    }
    /*
     * Whether this browser can put two tabs side by side.
     *
     * Probed through `tabs.createSplit` even though openSplitView opens its tab with
     * `tabs.create`'s `splitWithTabId`: the same browser feature carries both, and an
     * optional createProperties field cannot be probed at all -- passing one the
     * browser does not know is itself what throws.
     */
    function isSplitViewAvailable() {
        return typeof chrome.tabs.createSplit === "function";
    }
    self.updateSettings = function(message, sender, sendResponse) {
        let error = "";
        if (message.scope === "snippets") {
            // For settings from snippets, don't broadcast the update
            // neither persist into storage
            for (var k in message.settings) {
                if (conf.hasOwnProperty(k)) {
                    conf[k] = message.settings[k];
                }
            }
            const llmConf = conf.llm;
            _registerLlmProviders(llmConf);
            // what a page just told us outranks the stored copy this process booted
            // with, whether or not that read has landed yet -- but only when the
            // snippets actually carried providers: snippets that carry none say
            // nothing about the ones stored earlier, which is why persisting reports
            // back rather than just happening.
            if (_persistLlmProviderConfig(llmConf)) {
                state.llmProvidersFromSnippets = true;
            }
            if (llmConf.bedrock
                && llmConf.bedrock.accessKeyId
                && llmConf.bedrock.secretAccessKey
                && llmConf.bedrock.model) {
                delete message.settings.llm.bedrock;
            }
            if (llmConf.custom) {
                delete message.settings.llm.custom;
            }
            return { error };
        } else {
            if (message.settings.showAdvanced && isMV3) {
                if (isUserScriptsAvailable()) {
                    chrome.userScripts.configureWorld({
                        csp: 'script-src \'self\' \'unsafe-eval\'',
                        messaging: true
                    });
                    _updateAndPostSettings(message.settings);
                    registerUserScript(message.settings.snippets, () => {
                        _response(message, sendResponse, { error });
                    });
                    return;
                } else {
                    error = "Advanced mode is only available when Developer mode is turned on from chrome://extensions/.";
                }
            } else {
                _updateAndPostSettings(message.settings);
            }
        }
        return { error };
    };
    self.updateInputHistory = function(message, sender, sendResponse) {
        let key = undefined, value;
        for (var k in message) {
            key = k + "History";
            value = message[k];
            break;
        }
        if (key) {
            loadSettings(key, function(data) {
                let curr = data[key] || [];
                let toUpdate = {};
                if (value.constructor.name === "Array") {
                    toUpdate[key] = value;
                    _updateAndPostSettings(toUpdate);
                } else if (value.trim().length && value !== ".") {
                    curr = curr.filter(function(c) {
                        return c.trim().length && c !== value && c !== ".";
                    });
                    curr.unshift(value);
                    if (curr.length > 50) {
                        curr.pop();
                    }
                    toUpdate[key] = curr;
                    _updateAndPostSettings(toUpdate);
                }
                _response(message, sendResponse, {
                    history: curr
                });
            });
        }
    };
}
