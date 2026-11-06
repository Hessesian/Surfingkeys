import { RUNTIME } from '../runtime.js';
import { selectionToMarkdown } from '../pageMarkdown.js';
import {
    tabOpenLink,
} from '../utils.js';

export default function register({ api, clipboard, hints, front }) {
    const {
        cmap,
        map,
        mapkey,
        vmapkey,
    } = api;

    function getTableColumnHeads() {
        var tds = [];
        document.querySelectorAll("table").forEach(function(t) {
            var tr = t.querySelector("tr");
            if (tr) {
                tds.push(...tr.children);
            }
        });
        return tds;
    }
    mapkey('yc', '#7Copy a column of a table', function() {
        hints.create(getTableColumnHeads(), function(element) {
            var column = Array.from(element.closest("table").querySelectorAll("tr")).map(function(tr) {
                return tr.children.length > element.cellIndex ? tr.children[element.cellIndex].innerText : "";
            });
            clipboard.write(column.join("\n"));
        });
    });
    mapkey('ymc', '#7Copy multiple columns of a table', function() {
        var rows = null;
        hints.create(getTableColumnHeads(), function(element) {
            var column = Array.from(element.closest("table").querySelectorAll("tr")).map(function(tr) {
                return tr.children.length > element.cellIndex ? tr.children[element.cellIndex].innerText : "";
            });
            if (!rows) {
                rows = column;
            } else {
                column.forEach(function(c, i) {
                    rows[i] += "\t" + c;
                });
            }
            clipboard.write(rows.join("\n"));
        }, {multipleHits: true});
    });
    mapkey('yq', '#7Copy pre text', function() {
        hints.create("pre", function(element) {
            clipboard.write(element.innerText);
        });
    });

    cmap('<ArrowDown>', '<Ctrl-n>');
    cmap('<ArrowUp>', '<Ctrl-p>');
    mapkey('gq', '#1Click on an Image or a button', function() {
        hints.create("img, button", hints.dispatchMouseClick);
    });
    mapkey('<Alt-p>', '#3pin/unpin current tab', function() {
        RUNTIME("togglePinTab");
    });
    mapkey('<Alt-m>', '#3mute/unmute current tab', function() {
        RUNTIME("muteTab");
    });
    mapkey('g;', '#4Go one tab history back', function() {
        RUNTIME("historyTab", {backward: true});
    }, {repeatIgnore: true});
    mapkey('g,', '#4Go one tab history forward', function() {
        RUNTIME("historyTab", {backward: false});
    }, {repeatIgnore: true});
    mapkey('<Ctrl-6>', '#4Go to last used tab', function() {
        RUNTIME("goToLastTab");
    });
    mapkey('g[', '#4Go to first activated tab', function() {
        RUNTIME("historyTab", {index: 0});
    }, {repeatIgnore: true});
    mapkey('g]', '#4Go to last activated tab', function() {
        RUNTIME("historyTab", {index: -1});
    }, {repeatIgnore: true});
    map('gt', 'R');
    map('gT', 'E');
    mapkey('g0', '#3Go to the leftmost tab, or the Nth with a count', function() {
        RUNTIME("focusTabByIndex");
    });
    mapkey('g$', '#3Go to the rightmost tab', function() {
        RUNTIME("focusTabByIndex", {last: true});
    });
    mapkey('gp', '#4Go to the playing tab', function() {
        RUNTIME('getTabs', { queryInfo: {audible: true}}, response => {
            if (response.tabs?.at(0)) {
                const tab = response.tabs[0]
                RUNTIME('focusTab', {
                    windowId: tab.windowId,
                    tabId: tab.id
                });
            }
        })
    }, { repeatIgnore: true });
    mapkey('H', '#4Go back in history', function() {
        history.go(-1);
    }, {repeatIgnore: true});
    mapkey('L', '#4Go forward in history', function() {
        history.go(1);
    }, {repeatIgnore: true});
    map('<Ctrl-o>', 'H');
    map('<Ctrl-i>', 'L');
    mapkey('r', '#4Reload the page', function() {
        RUNTIME("reloadTab", { nocache: false });
    });
    mapkey(';oi', '#8Open incognito window', function() {
        RUNTIME('openIncognito', {
            url: window.location.href
        });
    });

    mapkey(';oH', '#8Open opened URL in current tab', function() {
        front.openOmnibar({type: "TabURLs"});
    });
    mapkey(';om', '#8Open URL from vim-like marks', function() {
        front.openOmnibar({type: "VIMarks"});
    });
    mapkey(':', '#8Open commands', function() {
        front.openOmnibar({type: "Commands"});
    });
    mapkey('A', '#8Open llm chat', function() {
        // the page is not sent along: the model asks for it with `read_page` when a
        // question actually needs it, so a chat that never needs it never pays for it
        front.openOmnibar({type: "LLMChat"});
    });
    vmapkey('A', '#8Open llm chat', function() {
        front.openOmnibar({type: "LLMChat", extra: {
            // what the user pointed at, so `read_page` serves this instead of the
            // whole page; it cannot be read later, the omnibar takes the selection.
            // Converted like the page itself rather than taken as a string: a
            // selection over a list of links is mostly the links.
            picked: selectionToMarkdown()
        }});
    });
    mapkey('yi', '#7Yank text of an input', function() {
        hints.create("input, textarea, select", function(element) {
            clipboard.write(element.value);
        });
    });
    mapkey('x', '#3Close current tab', function() {
        RUNTIME("closeTab");
    });
    mapkey(';w', '#2Focus top window', function() {
        top.focus();
    });
    mapkey('cc', '#7Open selected link or link from clipboard', function() {
        if (window.getSelection().toString()) {
            tabOpenLink(window.getSelection().toString());
        } else {
            clipboard.read(function(response) {
                tabOpenLink(response.data);
            });
        }
    });
    mapkey(';cq', '#7Clear all URLs in queue to be opened', function() {
        RUNTIME('clearQueueURLs');
    });
    mapkey('ys', "#7Copy current page's source", function() {
        var aa = document.documentElement.cloneNode(true);
        clipboard.write(aa.outerHTML);
    });
    mapkey('yj', "#7Copy current settings", function() {
        RUNTIME('getSettings', {
            key: "RAW"
        }, function(response) {
            clipboard.write(JSON.stringify(response.settings, null, 4));
        });
    });
    mapkey(';pj', "#7Restore settings data from clipboard", function() {
        clipboard.read(function(response) {
            RUNTIME('updateSettings', {
                settings: JSON.parse(response.data.trim())
            });
        });
    });
    mapkey('yt', '#3Duplicate current tab', function() {
        RUNTIME("duplicateTab");
    });
    mapkey('yT', '#3Duplicate current tab in background', function() {
        RUNTIME("duplicateTab", {active: false});
    });
    mapkey('yy', "#7Copy current page's URL", function() {
        if (RUNTIME.repeats > 1) {
            const num = RUNTIME.repeats;
            RUNTIME('getTabs', null, function (response) {
                const start = response.tabs.findIndex((t) => t.active);
                const range = response.tabs.slice(start, start + num);
                clipboard.write(range.map(tab => tab.url).join('\n'));
            });
            RUNTIME.repeats = 1;
        } else {
            var url = window.location.href;
            if (url.indexOf(chrome.runtime.getURL("/pages/pdf_viewer.html")) === 0) {
                const filePos = window.location.search.indexOf("=") + 1;
                url = window.location.search.substr(filePos);
            }
            clipboard.write(url);
        }
    });
    mapkey('yY', "#7Copy all tabs's url", function() {
        RUNTIME('getTabs', null, function (response) {
            clipboard.write(response.tabs.map(tab => tab.url).join('\n'));
        });
    });
    mapkey('yh', "#7Copy current page's host", function() {
        var url = new URL(window.location.href);
        clipboard.write(url.host);
    });
    mapkey('yl', "#7Copy current page's title", function() {
        clipboard.write(document.title);
    });
    mapkey('yQ', '#7Copy all query history of OmniQuery.', function() {
        RUNTIME('getSettings', {
            key: 'OmniQueryHistory'
        }, function(response) {
            clipboard.write(response.settings.OmniQueryHistory.join("\n"));
        });
    });
}
