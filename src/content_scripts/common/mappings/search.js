import { RUNTIME } from '../runtime.js';
import {
    getBrowserName,
    tabOpenLink,
} from '../utils.js';

export default function register({ api, clipboard, hints, front }) {
    const {
        addSearchAlias,
        map,
        mapkey,
        readText,
        vmapkey,
    } = api;

    addSearchAlias('g', 'google', 'https://www.google.com/search?q=', 's', 'https://www.google.com/complete/search?client=chrome-omni&gs_ri=chrome-ext&oit=1&cp=1&pgcl=7&q=', function(response) {
        var res = JSON.parse(response.text);
        return res[1];
    });
    addSearchAlias('d', 'duckduckgo', 'https://duckduckgo.com/?q=', 's', 'https://duckduckgo.com/ac/?q=', function(response) {
        var res = JSON.parse(response.text);
        return res.map(function(r){
            return r.phrase;
        });
    });
    addSearchAlias('b', 'baidu', 'https://www.baidu.com/s?wd=', 's', 'https://suggestion.baidu.com/su?cb=&wd=', function(response) {
        var res = response.text.match(/,s:\[("[^\]]+")]}/);
        return res ? res[1].replace(/"/g, '').split(",") : [];
    });

    addSearchAlias('e', 'wikipedia', 'https://en.wikipedia.org/wiki/', 's', 'https://en.wikipedia.org/w/api.php?action=opensearch&format=json&formatversion=2&namespace=0&limit=40&search=', function(response) {
        return JSON.parse(response.text)[1];
    });
    addSearchAlias('w', 'bing', 'https://www.bing.com/search?setmkt=en-us&setlang=en-us&q=', 's', 'https://api.bing.com/osjson.aspx?query=', function(response) {
        var res = JSON.parse(response.text);
        return res[1];
    });
    addSearchAlias('s', 'stackoverflow', 'https://stackoverflow.com/search?q=');
    addSearchAlias('h', 'github', 'https://github.com/search?q=', 's', 'https://api.github.com/search/repositories?order=desc&q=', function(response) {
        var res = JSON.parse(response.text)['items'];
        return res ? res.map(function(r){
            return {
                title: r.description,
                url: r.html_url
            };
        }) : [];
    });
    addSearchAlias('y', 'youtube', 'https://www.youtube.com/results?search_query=', 's',
    'https://clients1.google.com/complete/search?client=youtube&ds=yt&callback=cb&q=', function(response) {
        var res = JSON.parse(response.text.substr(9, response.text.length-10));
        return res[1].map(function(d) {
            return d[0];
        });
    });

    const bn = getBrowserName();
    if (bn === "Firefox") {
        mapkey(';on', '#3Open newtab', function() {
            tabOpenLink("about:blank");
        });
        mapkey(';cl', '#3Open a link in a container', function() {
            front.openContainer();
        });
    } else if (bn === "Chrome") {
        mapkey('cp', '#13Toggle proxy for current site', function() {
            var host = window.location.host.replace(/:\d+/,'');
            if (host && host.length) {
                RUNTIME('updateProxy', {
                    host: host,
                    operation: "toggle"
                });
            }
        });
        mapkey(';cp', '#13Copy proxy info', function() {
            RUNTIME('getSettings', {
                key: ['proxyMode', 'proxy', 'autoproxy_hosts']
            }, function(response) {
                clipboard.write(JSON.stringify(response.settings, null, 4));
            });
        });
        mapkey(';ap', '#13Apply proxy info from clipboard', function() {
            clipboard.read(function(response) {
                var proxyConf = JSON.parse(response.data);
                RUNTIME('updateProxy', {
                    operation: 'set',
                    host: proxyConf.autoproxy_hosts,
                    proxy: proxyConf.proxy,
                    mode: proxyConf.proxyMode
                });
            });
        });
        // create shortcuts for the command with different parameters
        map(';pa', ':setProxyMode always', 0, '#13set proxy mode `always`');
        map(';pb', ':setProxyMode byhost', 0, '#13set proxy mode `byhost`');
        map(';pd', ':setProxyMode direct', 0, '#13set proxy mode `direct`');
        map(';ps', ':setProxyMode system', 0, '#13set proxy mode `system`');
        map(';pc', ':setProxyMode clear', 0, '#13set proxy mode `clear`');
        mapkey('gr', '#14Read selected text or text from clipboard', function() {
            clipboard.read(function(response) {
                readText(window.getSelection().toString() || response.data, {verbose: true});
            });
        });
        vmapkey('gr', '#9Read selected text', function() {
            readText(window.getSelection().toString(), {verbose: true});
        });

        mapkey(';on', '#3Open newtab', function() {
            tabOpenLink("chrome://newtab/");
        });
        mapkey('ga', '#12Open Chrome About', function() {
            tabOpenLink("chrome://help/");
        });
        mapkey('gb', '#12Open Chrome Bookmarks', function() {
            tabOpenLink("chrome://bookmarks/");
        });
        mapkey('gc', '#12Open Chrome Cache', function() {
            tabOpenLink("chrome://cache/");
        });
        mapkey('gd', '#12Open Chrome Downloads', function() {
            tabOpenLink("chrome://downloads/");
        });
        mapkey('gh', '#12Open Chrome History', function() {
            tabOpenLink("chrome://history/");
        });
        mapkey('gk', '#12Open Chrome Cookies', function() {
            tabOpenLink("chrome://settings/cookies");
        });
        mapkey('ge', '#12Open Chrome Extensions', function() {
            tabOpenLink("chrome://extensions/");
        });
        mapkey('gn', '#12Open Chrome net-internals', function() {
            tabOpenLink("chrome://net-internals/#proxy");
        });
        mapkey(';i', '#12Open Chrome Inspect', function() {
            tabOpenLink("chrome://inspect/#devices");
        });
    }

    mapkey('X', '#3Restore closed tab', function() {
        RUNTIME("openLast");
    });

    if (!getBrowserName().startsWith("Safari")) {
        mapkey('t', '#8Open a URL', function() {
            front.openOmnibar({type: "URLs"});
        });
        mapkey('go', '#8Open a URL in current tab', function() {
            front.openOmnibar({type: "URLs", tabbed: false});
        });
        map('o', 'go');
        map('O', 't');
        mapkey(';ox', '#8Open recently closed URL', function() {
            front.openOmnibar({type: "RecentlyClosed"});
        });
        mapkey('b', '#8Open a bookmark', function() {
            front.openOmnibar(({type: "Bookmarks"}));
        });
        mapkey(';x', '#3Close tabs by URL', function() {
            front.openOmnibar({type: "CloseTabs"});
        });
        mapkey('ab', '#8Bookmark current page to selected folder', function() {
            var page = {
                url: window.location.href,
                title: document.title
            };
            front.openOmnibar(({type: "AddBookmark", extra: page}));
        });
        mapkey(';oh', '#8Open URL from history', function() {
            front.openOmnibar({type: "History"});
        });
        mapkey('W', '#3Move current tab to another window',  function() {
            front.openOmnibar(({type: "Windows"}));
        });
        mapkey(';gt', '#3Gather filtered tabs into current window', function() {
            front.openOmnibar({type: "Tabs", extra: {
                action: "gather"
            }});
        });
        mapkey(';gw', '#3Gather all tabs into current window',  function() {
            RUNTIME("gatherWindows");
        });
        mapkey('<<', '#3Move current tab to left', function() {
            RUNTIME('moveTab', {
                step: -1
            });
        });
        mapkey('>>', '#3Move current tab to right', function() {
            RUNTIME('moveTab', {
                step: 1
            });
        });
        mapkey('yd', "#7Copy current downloading URL", function() {
            RUNTIME('getDownloads', {
                query: {state: "in_progress"}
            }, function(response) {
                var items = response.downloads.map(function(o) {
                    return o.url;
                });
                clipboard.write(items.join(','));
            });
        });
        mapkey('gs', '#12View page source', function() {
            RUNTIME("viewSource", { tab: { tabbed: true }});
        });
        mapkey(';pm', '#11Preview markdown', function() {
            tabOpenLink("/pages/markdown.html");
        });
        mapkey(';di', '#1Download image', function() {
            hints.create('img', function(element) {
                RUNTIME('download', {
                    url: element.src
                });
            });
        });
        mapkey(';j', '#12Close Downloads Shelf', function() {
            RUNTIME("closeDownloadsShelf", {clearHistory: true});
        });
        mapkey(';dh', '#14Delete history older than 30 days', function() {
            RUNTIME('deleteHistoryOlderThan', {
                days: 30
            });
        });
        mapkey(';yh', '#14Yank histories', function() {
            RUNTIME('getHistory', {}, function(response) {
                clipboard.write(response.history.map(h => h.url).join("\n"));
            });
        });
        mapkey(';ph', '#14Put histories from clipboard', function() {
            clipboard.read(function(response) {
                RUNTIME('addHistories', {history: response.data.split("\n")});
            });
        });
        mapkey(';db', '#14Remove bookmark for current page', function() {
            RUNTIME('removeBookmark');
        });
    }
}
