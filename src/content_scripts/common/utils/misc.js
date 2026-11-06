import { RUNTIME, dispatchSKEvent, runtime } from '../runtime.js';
import { showPopup } from './ui.js';
import { setSanitizedContent } from './domHelpers.js';

const colors = [
    '#4169E1', // Royal Blue
    '#E74C3C', // Bright Red
    '#2ECC71', // Emerald Green
    '#9B59B6', // Amethyst Purple
    '#F39C12', // Orange
    '#16A085', // Teal
    '#E67E22', // Dark Orange
    '#3498DB', // Bright Blue
    '#C0392B', // Dark Red
    '#27AE60', // Forest Green
    '#8E44AD', // Wisteria Purple
    '#D35400', // Pumpkin Orange
    '#2980B9', // Ocean Blue
    '#FF5733', // Coral Red
    '#1ABC9C', // Turquoise
    '#8B008B', // Dark Magenta
    '#F1C40F', // Yellow
    '#008080', // Dark Teal
    '#FF8C00', // Dark Orange
    '#4682B4', // Steel Blue
    '#8B0000', // Dark Red
    '#32CD32', // Lime Green
    '#9932CC', // Dark Orchid
    '#FF4500', // Orange Red
    '#1E90FF', // Dodger Blue
    '#DC143C', // Crimson
    '#20B2AA', // Light Sea Green
    '#BA55D3', // Medium Orchid
    '#DAA520', // Goldenrod
    '#008B8B', // Dark Cyan
    '#CD853F', // Peru
    '#6495ED', // Cornflower Blue
    '#B22222', // Fire Brick
    '#3CB371', // Medium Sea Green
    '#9370DB', // Medium Purple
    '#A0522D', // Sienna
    '#87CEEB', // Sky Blue
    '#CD5C5C', // Indian Red
    '#48D1CC', // Medium Turquoise
    '#DDA0DD', // Plum
    '#FFD700', // Gold
    '#5F9EA0', // Cadet Blue
    '#FFA07A', // Light Salmon
    '#00BFFF', // Deep Sky Blue
    '#8B4513', // Saddle Brown
    '#90EE90', // Light Green
    '#FF69B4', // Hot Pink
    '#D2691E', // Chocolate
    '#B0C4DE', // Light Steel Blue
    '#FA8072', // Salmon
    '#66CDAA', // Medium Aquamarine
    '#DB7093', // Pale Violet Red
    '#FF8C69', // Salmon Pink
    '#556B2F', // Dark Olive Green
    '#FF7F50', // Coral
    '#2E8B57', // Sea Green
    '#9400D3', // Dark Violet
    '#B8860B', // Dark Goldenrod
    '#FF6347', // Tomato
    '#40E0D0', // Turquoise
    '#DA70D6', // Orchid
    '#BDB76B', // Dark Khaki
    '#F4A460', // Sandy Brown
    '#87CEFA', // Light Sky Blue
    '#98FB98', // Pale Green
    '#C71585', // Medium Violet Red
    '#B0E0E6', // Powder Blue
    '#F08080', // Light Coral
    '#7FFFD4', // Aquamarine
    '#FFA500', // Orange
    '#FF6B6B', // Light Red
    '#00CED1', // Dark Turquoise
    '#E9967A', // Dark Salmon
    '#4B0082', // Indigo
    '#7B68EE', // Medium Slate Blue
    '#6A5ACD', // Slate Blue
    '#483D8B', // Dark Slate Blue
    '#5D478B', // Medium Purple 4
    '#8A2BE2', // Blue Violet
    '#7EC0EE', // Sky Blue 2
    '#009ACD', // Deep Sky Blue 3
    '#00868B', // Turquoise 4
    '#00C78C', // Medium Spring Green
    '#00CD66', // Spring Green 3
    '#66CD00', // Chartreuse 3
    '#CDCD00', // Yellow 3
    '#CD9B1D', // Goldenrod 3
    '#CD6600', // Dark Orange 3
    '#CD4F39', // Tomato 3
    '#CD3278', // Violet Red 3
    '#CD3333', // Brown 3
    '#8B4789', // Orchid 4
    '#8B8B00', // Yellow 4
    '#8B7355', // Rosy Brown 4
    '#8B636C', // Pink 4
    '#2F4F4F', // Dark Slate Gray
    '#FF1493', // Deep Pink
    '#800080', // Purple
    '#708090', // Slate Gray
    '#6B8E23'  // Olive Drab
];

function getColor(i) {
    return colors[i];
}

function isEmptyObject(obj) {
    for (var name in obj) {
        return false;
    }
    return true;
}

function applyUserSettings(delta) {
    if (delta.error !== "") {
        if (window === top) {
            showPopup("[SurfingKeys] Error found in settings: " + delta.error);
        } else {
            console.log("[SurfingKeys] Error found in settings({0}): {1}".format(window.location.href, delta.error));
        }
    }
    if (!isEmptyObject(delta.settings)) {
        dispatchSKEvent("front", ['applySettingsFromSnippets', delta.settings]);
    }
}

/**
 * Get current browser name
 * @returns {string} "Chrome" | "Firefox" | "Safari"
 *
 */
function getBrowserName() {
    if (window.navigator.userAgent.indexOf("Chrome") !== -1) {
        return "Chrome";
    } else if (window.navigator.vendor.indexOf("Apple Computer, Inc.") === 0) {
        let isIOS = /iPad|iPhone|iPod/.test(navigator.platform)
            || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
        return isIOS ? "Safari-iOS" : "Safari";
    } else if (window.navigator.userAgent.indexOf("Firefox") !== -1) {
        return "Firefox";
    }
    return "Chrome";
}

function isInUIFrame() {
    return window !== top && document.location.href.indexOf(chrome.runtime.getURL("/")) === 0;
}

function timeStampString(t) {
    var dt = new Date();
    dt.setTime(t);
    return dt.toLocaleString();
}

function getDocumentOrigin() {
    // https://developer.mozilla.org/en-US/docs/Web/API/Window/postMessage
    // Lastly, posting a message to a page at a file: URL currently requires that the targetOrigin argument be "*".
    // file:// cannot be used as a security restriction; this restriction may be modified in the future.
    // Firefox provides window.origin instead of document.origin.
    var origin = window.location.origin ? window.location.origin : "*";
    if (origin === "file://" || origin === "null") {
        origin = "*";
    }
    return origin;
}

function generateQuickGuid() {
    return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
}

function initL10n(cb) {
    const lang = runtime.conf.language || window.navigator.language;
    if (lang === "en-US") {
        cb(function(str) {
            return str;
        });
    } else {
        fetch(chrome.runtime.getURL("pages/l10n.json")).then(function(res) {
            return res.json();
        }).then(function(l10n) {
            if (typeof(l10n[lang]) === "object") {
                l10n = l10n[lang];
                cb(function(str) {
                    return l10n[str] ? l10n[str] : str;
                });
            } else {
                cb(function(str) {
                    return str;
                });
            }
        });
    }
}

String.prototype.format = function() {
    var formatted = this;
    for (var i = 0; i < arguments.length; i++) {
        var regexp = new RegExp('\\{' + i + '\\}', 'gi');
        formatted = formatted.replace(regexp, arguments[i]);
    }
    return formatted;
};

String.prototype.reverse = function() {
    return this.split("").reverse().join("");
};

RegExp.prototype.toJSON = function() {
    return {source: this.source, flags: this.flags};
};

if (!Array.prototype.flatMap) {
    Array.prototype.flatMap = function(lambda) {
        return Array.prototype.concat.apply([], this.map(lambda));
    };
}

function httpRequest(args, onSuccess) {
    args.method = "get";
    RUNTIME("request", args, onSuccess);
}

function refreshHints(hints, pressedKeys) {
    const result = {candidates: 0};
    if (pressedKeys.length > 0) {
        for (const hint of hints) {
            const label = hint.label;
            if (pressedKeys === label) {
                result.matched = hint.link;
                break;
            } else if (label.indexOf(pressedKeys) === 0) {
                hint.style.opacity = 1;
                setSanitizedContent(hint, `<span style="opacity: 0.2;">${pressedKeys}</span>` + label.substr(pressedKeys.length));
                result.candidates ++;
            } else {
                hint.style.opacity = 0;
            }
        }
    } else {
        if (hints.length === 1) {
            result.matched = hints[0].link;
        } else {
            for (const hint of hints) {
                hint.style.opacity = 1;
                setSanitizedContent(hint, hint.label);
            }
            result.candidates = hints.length;
        }
    }
    return result;
}

async function hashString(str, algorithm = 'SHA-256') {
    const encoder = new TextEncoder();
    const data = encoder.encode(str);
    const hashBuffer = await crypto.subtle.digest(algorithm, data);

    // Convert to hex string
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

    return hashHex;
}

export {
    getColor,
    applyUserSettings,
    getBrowserName,
    isInUIFrame,
    timeStampString,
    getDocumentOrigin,
    generateQuickGuid,
    initL10n,
    httpRequest,
    refreshHints,
    hashString,
};
