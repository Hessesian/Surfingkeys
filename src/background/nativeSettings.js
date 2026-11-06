import { NATIVE_HOST_NAME } from '../common/utils.js';

// Without a deadline, a host that stays alive but answers nothing leaves getSettings
// unanswered and the page runs no user settings at all.
const NATIVE_SETTINGS_TIMEOUT = 5000;

// Callbacks waiting on the read that is currently running, or null when none is.
let nativeSettingsWaiters = null;

// The long-lived connection to neovim, when this browser has one. Module-level
// because _save() reads the file too, from outside start()'s scope.
let nativeHost = null;

// Claimed by start() before the first settings load, so even that read goes over the
// editor's connection.
function setNativeHost(host) {
    nativeHost = host;
}

// Turns one native reply into onReady or onException. The nvim host wraps every
// reply as {status, res, id}; the Safari app answers with the payload itself.
function deliverNativeSettings(response, onReady, onException) {
    const reply = (response && response.res) || response;
    // status false means the host itself threw, so `res` is a STRING with no
    // `.error`. Checked first, or a lua error the host already named is reported as
    // an out-of-date server.lua.
    if (response && response.status === false) {
        onException(typeof reply === "string" && reply
            ? reply
            : "the native app failed to read the file");
    } else if (!reply) {
        onException("no response from the native app");
    } else if (reply.error) {
        onException(reply.error);
    } else if (typeof reply.data === "string") {
        onReady(reply.data);
    } else {
        onException("the native app did not return the file, please update it");
    }
}

// Asks the native app for ~/.surfingkeys.js, which the extension cannot read itself:
// Safari can fetch no file:// URL, and elsewhere the browser will not tell us where
// the user's home directory is.
//
// Over the neovim connection when there is one, so one process serves the editor and
// the read. sendNativeMessage is for Safari, whose host is its containing app; on
// Chrome and Firefox it would start `nvim --headless` once per read.
//
// Concurrent callers share one read, since a full settings load happens once per
// FRAME. Only OVERLAPPING reads are shared, so an edit to ~/.surfingkeys.js takes
// effect on the next page load.
//
// onException gets the native side's own message: no host, no such file, an old
// server.lua and no answer at all need different fixes.
function readNativeSettings(onReady, onException) {
    if (nativeSettingsWaiters) {
        nativeSettingsWaiters.push({onReady, onException});
        return;
    }
    const waiters = [{onReady, onException}];
    nativeSettingsWaiters = waiters;

    // Whichever of the deadline and the reply lands first ends the read for everyone:
    // a reply arriving afterwards must not hand the page settings it has been told it
    // is not getting. The waiter list is cleared before the callbacks run, so one that
    // reads again from its own callback starts a fresh read.
    //
    // Giving up is told to the neovim connection too, which has no deadline of its own
    // and would hold the request for the next read to trip over.
    let settled = false;
    const abandon = new AbortController();
    const finish = function(method, arg) {
        if (settled) {
            return;
        }
        settled = true;
        clearTimeout(timer);
        abandon.abort();
        nativeSettingsWaiters = null;
        waiters.forEach(function(waiter) {
            waiter[method](arg);
        });
    };
    const timer = setTimeout(function() {
        finish("onException", `the native app did not answer within ${NATIVE_SETTINGS_TIMEOUT / 1000} seconds`);
    }, NATIVE_SETTINGS_TIMEOUT);
    const onReply = (response) => deliverNativeSettings(response,
        (data) => finish("onReady", data),
        (reason) => finish("onException", reason));

    if (nativeHost && nativeHost.request) {
        // No fallback to a one-off process when this connection is unusable: the
        // point of sending it here is that there is ONE neovim.
        nativeHost.request({command: "Settings.read"}, {signal: abandon.signal}).then(onReply, function(error) {
            finish("onException", error && error.message ? error.message : String(error));
        });
        return;
    }

    try {
        chrome.runtime.sendNativeMessage(NATIVE_HOST_NAME, {command: "Settings.read"}, function(response) {
            if (chrome.runtime.lastError) {
                finish("onException", chrome.runtime.lastError.message);
                return;
            }
            onReply(response);
        });
    } catch (e) {
        finish("onException", e.toString());
    }
}

export { readNativeSettings, setNativeHost };
