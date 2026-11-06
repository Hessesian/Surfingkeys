import { RUNTIME, dispatchSKEvent } from '../runtime.js';
import { getBrowserName } from './misc.js';

function parseQueryString(query) {
    var params = {};
    if (query.length) {
        var parts = query.split('&');
        for (var i = 0, ii = parts.length; i < ii; ++i) {
            var param = parts[i].split('=');
            var key = param[0].toLowerCase();
            var value = param.length > 1 ? param[1] : null;
            params[decodeURIComponent(key)] = decodeURIComponent(value);
        }
    }
    return params;
}

function constructSearchURL(se, word) {
    if (se.indexOf("{0}") > 0) {
        return se.format(word);
    } else if (se.indexOf("%s") > 0) {
        return se.replace("%s", word)
    } else {
        return se + word;
    }
}

/**
 * Open links in new tabs.
 *
 * @param {string} str links to be opened, the links should be split by `\n` if there are more than one.
 * @param {number} [simultaneousness=5] how many tabs will be opened simultaneously, the rest will be queued and opened later whenever a tab is closed.
 *
 * @example tabOpenLink('https://github.com/brookhong/Surfingkeys')
 */
function tabOpenLink(str, simultaneousness) {
    simultaneousness = simultaneousness || 5;

    var urls;
    if (str.constructor.name === "Array") {
        urls = str;
    } else if (str instanceof NodeList) {
        urls = Array.from(str).map(function(n) {
            return n.href;
        });
    } else {
        urls = str.trim().split('\n');
    }

    urls = urls.map(function(u) {
        return u.trim();
    }).filter(function(u) {
        return u.length > 0;
    });

    if (urls.length > simultaneousness) {
        dispatchSKEvent("front", ['showDialog', `Do you really want to open all these ${urls.length} links?`, () => {
            // open the first batch links immediately
            urls.slice(0, simultaneousness).forEach(function(url) {
                RUNTIME("openLink", {
                    tab: {
                        tabbed: true
                    },
                    url: url
                });
            });
            // queue the left for later opening when there is one tab closed.
            RUNTIME("queueURLs", {
                urls: urls.slice(simultaneousness)
            });
        }]);
    } else {
        urls.forEach(function(url) {
            RUNTIME("openLink", {
                tab: {
                    tabbed: true
                },
                url: url
            });
        });
    }
}

function safeDecodeURI(url) {
    try {
        return decodeURI(url);
    } catch (e) {
        return url;
    }
}

function safeDecodeURIComponent(url) {
    try {
        return decodeURIComponent(url);
    } catch (e) {
        return url;
    }
}

function attachFaviconToImgSrc(tab, imgEl) {
    const browserName = getBrowserName();
    if (browserName === "Chrome") {
        imgEl.src = chrome.runtime.getURL(`/_favicon/?pageUrl=${encodeURIComponent(tab.url)}`);
    } else if (browserName.startsWith("Safari")) {
        imgEl.src = new URL(tab.url).origin + "/favicon.ico";
    } else {
        imgEl.src = tab.favIconUrl;
    }
}

export {
    constructSearchURL,
    tabOpenLink,
    safeDecodeURI,
    safeDecodeURIComponent,
    attachFaviconToImgSrc,
};
