import { NATIVE_HOST_NAME } from '../../common/utils.js';
import { request } from '../storage.js';

export default function registerMisc(bg) {
    const {self, browser, isMV3, tabIconStatus, _response, state} = bg;
    const sendTabMessage = (...args) => bg.sendTabMessage(...args);

    self.setSurfingkeysIcon = function(message, sender, sendResponse) {
        const tabId = sender.tab ? sender.tab.id : undefined;
        // Only touch the icon API when the per-tab state actually changed;
        // every page load reports the state again, most often the same one.
        if (tabId !== undefined && tabIconStatus[tabId] === message.status) {
            return;
        }
        let icon = "icons/48.png";
        if (message.status === "disabled") {
            icon = "icons/48-x.png";
        } else if (message.status === "lurking") {
            icon = "icons/48-l.png";
        }
        const browserAction = isMV3 ? chrome.action : chrome.browserAction;
        browserAction.setIcon({
            path: icon,
            tabId: tabId
        });
        if (tabId !== undefined) {
            tabIconStatus[tabId] = message.status;
        }
    };
    self.request = function(message, sender, sendResponse) {
        request(message.url, function(res) {
            _response(message, sendResponse, {
                text: res
            });
        }, message.headers, message.data, (e) => {
            _response(message, sendResponse, {
                error: e.toString()
            });
        });
    };
    self.requestImage = function(message, sender, sendResponse) {
        fetch(message.url, {
            method: "GET"
        }).then(res => {
            return res.blob()
        }).then(blob => {
            return createImageBitmap(blob)
        }).then(img => {
            const canvas = new OffscreenCanvas(img.width, img.height)
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0,0, canvas.width, canvas.height);
            canvas.convertToBlob().then(blob => {
                const fr = new FileReader();
                fr.onload = function(e) {
                    _response(message, sendResponse, {
                        text: e.target.result
                    });
                }
                fr.readAsDataURL(blob);
            });
        }).catch(exp => {
            _response(message, sendResponse, {
                text: ""
            });
        });
    };
    self.setZoom = function(message, sender, sendResponse) {
        var tabId = sender.tab.id;
        var zoomFactor = message.zoomFactor * message.repeats;
        if (zoomFactor == 0) {
            chrome.tabs.getZoomSettings(tabId, function(settings) {
                const defaultZoom = settings.defaultZoomFactor ?
                    settings.defaultZoomFactor : 1;
                chrome.tabs.setZoom(tabId, defaultZoom);
            });
        } else {
            chrome.tabs.getZoom(tabId, function(zf) {
                chrome.tabs.setZoom(tabId, zf + zoomFactor);
            });
        }
    };
    self.captureVisibleTab = function(message, sender, sendResponse) {
        chrome.tabs.captureVisibleTab(null, {format: "png"}, function(dataUrl) {
            _response(message, sendResponse, {
                dataUrl: dataUrl
            });
        });
    };
    self.getCaptureSize = function(message, sender, sendResponse) {
        chrome.tabs.captureVisibleTab(null, {format: "png"}, function(dataUrl) {
            fetch(dataUrl)
                .then(function(res) {
                    return res.blob();
                })
                .then(function(blob) {
                    return createImageBitmap(blob);
                })
                .then(function(img) {
                    _response(message, sendResponse, {
                        width: img.width,
                        height: img.height
                    });
                });
        });
    };

    state._queueURLs = [];
    self.queueURLs = function(message, sender, sendResponse) {
        state._queueURLs = state._queueURLs.concat(message.urls);
    };
    self.getQueueURLs = function(message, sender, sendResponse) {
        return {
            queueURLs: state._queueURLs
        };
    };
    self.clearQueueURLs = function(message, sender, sendResponse) {
        state._queueURLs = [];
    };

    self.getVoices = function(message, sender, sendResponse) {
        chrome.tts.getVoices(function(voices) {
            _response(message, sendResponse, {
                voices: voices
            });
        });
    };

    self.read = function(message, sender, sendResponse) {
        var options = message.options || {};
        options.onEvent = function(ttsEvent) {
            // https://developer.chrome.com/docs/extensions/mv2/messaging/
            // If multiple pages are listening for onMessage events, only the first to call sendResponse()
            // for a particular event will succeed in sending the response. All other responses to that event will be ignored.
            //
            // Thus for the later events after `start` we will send them in sendTabMessage.
            if (ttsEvent.type === "start") {
                _response(message, sendResponse, {
                    ttsEvent: ttsEvent
                });
            } else {
                sendTabMessage(sender.tab.id, -1, {
                    subject: 'onTtsEvent',
                    ttsEvent: ttsEvent
                });
            }
        };
        chrome.tts.speak(message.content, options);
    };
    self.stopReading = function(message, sender, sendResponse) {
        chrome.tts.stop();
    };

    self.openIncognito = function(message, sender, sendResponse) {
        chrome.windows.create({"url": message.url, "incognito": true});
    };

    // Safari writes through the native app, which sets the system pasteboard
    // directly, rather than through navigator.clipboard.writeText here: that call
    // runs in the background page, which by the time this message arrives has none
    // of the user activation the original keypress had, and WebKit enforces that
    // requirement strictly enough that the write fails unpredictably. Firefox's
    // background page is not held to that, so it keeps the direct call.
    //
    // Native contract: {command: "Clipboard.write", text}, answered with {} on
    // success or {error} on failure
    self.writeClipboard = function (message, sender, sendResponse) {
        if (browser.name === "Safari") {
            chrome.runtime.sendNativeMessage(NATIVE_HOST_NAME, {command: "Clipboard.write", text: message.text}, function(response) {
                if (chrome.runtime.lastError) {
                    _response(message, sendResponse, {error: chrome.runtime.lastError.message});
                    return;
                }
                _response(message, sendResponse, response);
            });
        } else {
            navigator.clipboard.writeText(message.text).then(
                () => _response(message, sendResponse, {}),
                (err) => _response(message, sendResponse, {error: err && err.message ? err.message : String(err)})
            );
        }
    };
    self.readClipboard = function (message, sender, sendResponse) {
        // only for Safari
        chrome.runtime.sendNativeMessage(NATIVE_HOST_NAME, {command: "Clipboard.read"}, function(response) {
            _response(message, sendResponse, response);
        });
    };

    self.connectNative = function (message, sender, sendResponse) {
        if (browser.nvimServer && browser.nvimServer.instance) {
            browser.nvimServer.instance.then(({url, nm}) => {
                nm.postMessage({
                    mode: message.mode
                });
                _response(message, sendResponse, {
                    url,
                });
            }).catch((error) => {
                _response(message, sendResponse, {
                    error,
                });
            });
        }
    };
}
