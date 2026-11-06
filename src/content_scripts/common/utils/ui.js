import { RUNTIME, dispatchSKEvent, runtime, skEventName } from '../runtime.js';

/**
 * Show message in banner.
 *
 * @param {string} msg the message to be displayed in banner.
 * @param {number} [timeout=1600] milliseconds after which the banner will disappear.
 * @name Front.showBanner
 *
 * @example
 * Front.showBanner(window.location.href);
 */
function showBanner(msg, timeout) {
    dispatchSKEvent("front", ['showBanner', msg, timeout])
}

/**
 * Show message in popup.
 *
 * @param {string} msg the message to be displayed in popup.
 * @name Front.showPopup
 *
 * @example
 * Front.showPopup(window.location.href);
 */
function showPopup(msg) {
    dispatchSKEvent("front", ['showPopup', msg])
}

/**
 * Send a chat request to the configured LLM provider and stream the response.
 *
 * @param {object[]} messages the messages array, with the first one as the system prompt.
 * @param {function} onChunk a callback on each response chunk.
 * @param {function} [onDone] a callback when the response completes.
 * @returns {boolean} whether the request was started, false if another request is in progress.
 */
function llmRequest(messages, onChunk, onDone) {
    if (runtime.bookMessage('llmResponse', (resp) => {
        if (resp.chunk) {
            onChunk(resp.chunk);
        } else if (resp.done) {
            runtime.releaseMessage('llmResponse');
            onDone && onDone(resp.message);
        }
    })) {
        RUNTIME("llmRequest", {messages, provider: runtime.conf.defaultLLMProvider});
        return true;
    }
    return false;
}

function openOmnibar(args) {
    dispatchSKEvent("front", ['openOmnibar', args])
}

function initSKFunctionListener(name, interfaces, capture) {
    const callbacks = {};

    const opts = capture ? {capture: true} : {};
    document.addEventListener(skEventName(name), function(evt) {
        let args = evt.detail;
        const fk = args.shift();
        if (capture) {
            // restore the un-serializable node from evt.target into the "__EVENT_TARGET__" placeholder
            if (args.length > 0 && args[0].constructor.name === "Array" && args[0][0] === "__EVENT_TARGET__") {
                args[0][0] = evt.target;
            } else if (args.length > 0 && args[0] === "__EVENT_TARGET__") {
                args[0] = evt.target;
            } else {
                args.push(evt.target);
            }
        }

        if (callbacks.hasOwnProperty(fk)) {
            callbacks[fk](...args);
            delete callbacks[fk];
        } if (interfaces.hasOwnProperty(fk)) {
            interfaces[fk](...args);
        }
    }, opts);

    return callbacks;
}

function reportIssue(title, description) {
    title = encodeURIComponent(title);
    description = "%23%23+Error+details%0A%0A{0}%0A%0ASurfingKeys%3A+{1}%0A%0AChrome%3A+{2}%0A%0AURL%3A+{3}%0A%0A%23%23+Context%0A%0A%2A%2APlease+replace+this+with+a+description+of+how+you+were+using+SurfingKeys.%2A%2A".format(encodeURIComponent(description), chrome.runtime.getManifest().version, encodeURIComponent(navigator.userAgent), encodeURIComponent(window.location.href));
    var error = '<h2>Uh-oh! The SurfingKeys extension encountered a bug.</h2> <p>Please click <a href="https://github.com/brookhong/Surfingkeys/issues/new?title={0}&body={1}" target=_blank>here</a> to start filing a new issue, append a description of how you were using SurfingKeys before this message appeared, then submit it.  Thanks for your help!</p>'.format(title, description);

    showPopup(error);
}

export {
    showBanner,
    showPopup,
    llmRequest,
    openOmnibar,
    initSKFunctionListener,
    reportIssue,
};
