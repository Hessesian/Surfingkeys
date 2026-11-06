import { RUNTIME, dispatchSKEvent, runtime, skEventName } from '../runtime.js';
import {
    actionWithSelectionPreserved,
    flashPressedLink,
    getTextNodePos,
} from '../utils.js';

export default function register({ api, clipboard, normal, hints, front }) {
    const {
        map,
        mapkey,
    } = api;

    function getSentence(textNode, offset) {
        var sentence = "";

        actionWithSelectionPreserved(function(sel) {
            sel.setPosition(textNode, offset);
            sel.modify("extend", "backward", "sentence");
            sel.collapseToStart();
            sel.modify("extend", "forward", "sentence");

            sentence = sel.toString();
        });

        return sentence.replace(/\n/g, '');
    }

    mapkey("cq", '#7Query word with Hints', function() {
        hints.create(runtime.conf.textAnchorPat, function (element) {
            var word = element[2].trim().replace(/[^A-z].*$/, "");
            var b = getTextNodePos(element[0], element[1], element[2].length);
            front.performInlineQuery(word, {
                top: b.top,
                left: b.left,
                height: b.height,
                width: b.width
            }, function (pos, queryResult) {
                dispatchSKEvent("front", ['showBubble', pos, queryResult, false]);
            });
        });
    });


    map('g0', ':feedkeys 99E', 0, "#3Go to the first tab");
    map('g$', ':feedkeys 99R', 0, "#3Go to the last tab");
    mapkey('zr', '#3zoom reset', function() {
        RUNTIME('setZoom', {
            zoomFactor: 0
        });
    });
    mapkey('zi', '#3zoom in', function() {
        RUNTIME('setZoom', {
            zoomFactor: 0.1
        });
    });
    mapkey('zo', '#3zoom out', function() {
        RUNTIME('setZoom', {
            zoomFactor: -0.1
        });
    });

    map('ZQ', ':quit');
    mapkey('ZZ', '#5Save session and quit', function() {
        RUNTIME('createSession', {
            name: 'LAST',
            quitAfterSaved: true
        });
    });
    mapkey('ZR', '#5Restore last session', function() {
        RUNTIME('openSession', {
            name: 'LAST'
        });
    });
    map('<Ctrl-u>', 'u');
    map('<Ctrl-d>', 'd');
    mapkey('af', '#1Open a link in active new tab', function() {
        hints.create("", hints.dispatchMouseClick, {tabbed: true, active: true});
    });
    mapkey('gf', '#1Open a link in non-active new tab', function() {
        hints.create("", hints.dispatchMouseClick, {tabbed: true, active: false});
    });
    mapkey('cf', '#1Open multiple links in a new tab', function() {
        hints.create("", hints.dispatchMouseClick, {multipleHits: true});
    });
    /*
     * Split view is new and not in every build, so whether `sf` is a mapping at all is
     * answered by the background -- the only side that can see chrome.tabs -- and that
     * answer arrives with the settings, after the rest of this keymap is already in
     * place. Registered before the user's snippets run, so `unmap('sf')` still works.
     */
    document.addEventListener(skEventName("userSettingsLoaded"), (evt) => {
        if (!evt.detail.settings.isSplitViewAvailable) {
            return;
        }
        // '*[href]' rather than the clickables `f` hints: a split view is opened from a
        // URL, so hinting only what has one means every hint shown can do the thing,
        // instead of a hint on a script-driven button that can only fail.
        mapkey('sf', '#1Open a link in a split view beside this tab', function() {
            hints.create('*[href]', function(element) {
                flashPressedLink(element, () => {
                    RUNTIME('openSplitView', {url: element.href, active: true});
                });
            }, {statusLine: "Open a link in a split view"});
        });
    }, {once: true});
    mapkey('<Ctrl-h>', '#1Display hints to focus scrollable elements', function() {
        hints.create(normal.refreshScrollableElements(), hints.dispatchMouseClick);
    });
    mapkey('<Ctrl-j>', '#1Mouse out elements.', function() {
        hints.create("", hints.dispatchMouseClick, {mouseEvents: ["mouseout"]});
    });
    mapkey('ya', '#7Copy a link URL to the clipboard', function() {
        hints.create('*[href]', function(element) {
            clipboard.write(element.href);
        });
    });
    mapkey('yma', '#7Copy multiple link URLs to the clipboard', function() {
        var linksToYank = [];
        hints.create('*[href]', function(element) {
            linksToYank.push(element.href);
            clipboard.write(linksToYank.join('\n'));
        }, {multipleHits: true});
    });
}
