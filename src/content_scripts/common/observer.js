import {
    initSKFunctionListener,
} from './utils.js';

import Mode from './mode';

function isElementPositionRelative(elm) {
    while (elm !== document.body) {
        if (getComputedStyle(elm).position === "relative") {
            return true;
        }
        elm = elm.parentElement;
    }
    return false;
}

function isPossibleModalElement(e) {
    var br = e.getBoundingClientRect();
    return br.height > 0
        && getComputedStyle(e).visibility !== 'hidden'
        && br.width > 300 && br.height > 300
        && br.width <= window.innerWidth && br.height <= window.innerHeight
        && br.top >= 0 && br.left >= 0
        && br.top <= window.innerHeight && br.left <= window.innerWidth
        && Mode.hasScroll(e, 'y', 16)
        && isElementPositionRelative(e);
}

function findPossibleModalElements(addedNodes) {
    var possibleModalElements = [];
    for (var added of addedNodes) {
        if (isPossibleModalElement(added)) {
            possibleModalElements.push(added);
        }
        var descendants = added.querySelectorAll('*');
        for (var i = 0; i < descendants.length; i++) {
            if (isPossibleModalElement(descendants[i])) {
                possibleModalElements.push(descendants[i]);
            }
        }
    }
    return possibleModalElements;
}

function startScrollNodeObserver(normal) {
    var pendingUpdater = undefined, DOMObserver = new MutationObserver(function (mutations) {
        var addedNodes = [];
        for (var m of mutations) {
            for (var n of m.addedNodes) {
                if (n.nodeType === Node.ELEMENT_NODE && !n.fromSurfingKeys) {
                    n.newlyCreated = true;
                    addedNodes.push(n);
                }
            }
        }

        if (addedNodes.length) {
            if (pendingUpdater) {
                clearTimeout(pendingUpdater);
                pendingUpdater = undefined;
            }
            pendingUpdater = setTimeout(function() {
                var possibleModalElements = findPossibleModalElements(addedNodes);

                if (possibleModalElements.length) {
                    normal.addScrollableElement(possibleModalElements[0]);
                }
            }, 200);
        }
    });
    DOMObserver.isConnected = false;

    initSKFunctionListener("observer", {
        turnOn: () => {
            if (!DOMObserver.isConnected) {
                DOMObserver.observe(document, { childList: true, subtree:true });
                DOMObserver.isConnected = true;
            }
        },
        turnOff: () => {
            if (DOMObserver.isConnected) {
                DOMObserver.disconnect();
                DOMObserver.isConnected = false;
            }
        },
    });
}

export default startScrollNodeObserver;
