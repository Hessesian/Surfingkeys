import { runtime } from '../runtime.js';
import { visibleCandidates, visibleTextElements } from '../elementIndex';
import {
    filterInvisibleElements,
    filterOverlapElements,
    getStructuralClickableSelector,
    getVisibleElements,
    getVisibleElementsBySelector,
    isElementClickableByCursor,
} from '../utils.js';

// The elements a click-hints session offers for `cssSelector`: "" means everything that
// looks clickable, an array is taken as given, anything else is a selector.
export function clickCandidates(cssSelector, behaviours) {
    let elements;
    if (cssSelector === "") {
        const selector = getStructuralClickableSelector();
        elements = visibleCandidates(selector, {width: window.innerWidth, height: window.innerHeight})
            || getVisibleElementsBySelector(selector);
        // Fall back to the expensive full-DOM cursor heuristic when the
        // fast pass found nothing (page built entirely from non-semantic
        // markup), when the user has explicitly asked for it every time
        // (runtime.conf.detectClickableByCursor), or when this specific
        // call asked for it (behaviours.forceDetectByCursor, set by the
        // "F" mapping for an on-demand full-coverage scan).
        if (elements.length === 0 || runtime.conf.detectClickableByCursor || behaviours.forceDetectByCursor) {
            const structural = new Set(elements);
            const byCursor = getVisibleElements(function(e, v) {
                if (!structural.has(e) && isElementClickableByCursor(e)) {
                    v.push(e);
                }
            });
            elements = elements.concat(byCursor);
        }
        elements = filterOverlapElements(elements);
    } else if (Array.isArray(cssSelector)) {
        elements = filterInvisibleElements(cssSelector);
    } else {
        elements = getVisibleElementsBySelector(cssSelector, function(e) {
            return !e.disabled && !e.readOnly;
        });
        elements = filterInvisibleElements(elements);
        elements = filterOverlapElements(elements);
    }
    return elements;
}

// Every [textNode, offset, matchedText] the text-hints session can point at: one per
// text node, or one per match of `rxp` when it is global.
export function textNodePositions(rxp) {
    var elements = visibleTextElements({width: window.innerWidth, height: window.innerHeight}) || getVisibleElements(function(e, v) {
        var aa = e.childNodes;
        for (var i = 0, len = aa.length; i < len; i++) {
            if (aa[i].nodeType == Node.TEXT_NODE && aa[i].data.length > 0) {
                v.push(e);
                break;
            }
        }
    });
    elements = elements.flatMap(function (e) {
        var aa = e.childNodes;
        var bb = [];
        for (var i = 0, len = aa.length; i < len; i++) {
            if (aa[i].nodeType == Node.TEXT_NODE && aa[i].data.trim().length > 1) {
                bb.push(aa[i]);
            }
        }
        return bb;
    });

    var positions;
    if (rxp.flags.indexOf('g') === -1) {
        positions = elements.map(function(e) {
            return [e, 0, ""];
        });
    } else {
        positions = [];
        for (var i = 0, length = elements.length; i < length; i++) {
            var e = elements[i], match;
            while ((match = rxp.exec(e.data)) != null) {
                positions.push([e, match.index, match[0]]);
            }
        }
    }
    return positions;
}
