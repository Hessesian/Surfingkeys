import { runtime } from '../runtime.js';
import { listElements, isElementDrawn } from './visibility.js';

function filterAncestors(elements) {
    if (elements.length === 0) {
        return elements;
    }

    // filter out element which has its children covered
    var result = [];
    elements.forEach(function(e, i) {
        if (isExplicitlyRequested(e)) {
            result.push(e);
        } else {
            for (var j = 0; j < result.length; j++) {
                if (result[j].contains(e)) {
                    if (result[j].tagName !== 'A' || !result[j].href) {
                        result[j] = e;
                    }
                    return;
                } else if (result[j].shadowRoot && result[j].shadowRoot.contains(e)) {
                    // skip child from shadowRoot of a selected element.
                    return;
                } else if (e.contains(result[j])) {
                    console.log("skip: ", e, result[j]);
                    return;
                }
            }
            result.push(e);
        }
    });

    return result;
}

/**
 * Merge the fragment rects of an inline element into lines, and return the widest one.
 *
 * A fragment is not a line: text broken up by comment nodes puts several fragments on
 * one line, any of which may be a single character too small to be hintable. Only the
 * rects sharing a top belong to the same line, which holds here because every fragment
 * is text in one computed style.
 *
 * The widest line is the full-measure line of a wrapped element rather than a short tail
 * at either end. The element's bounding box cannot stand in for it: when the element
 * wraps, that box also covers content the element does not, so its center point hits
 * something else.
 */
function widestLineRect(rects) {
    var lines = [];
    Array.from(rects).forEach(function(r) {
        var line = lines.find(function(l) { return Math.abs(l.top - r.top) < 1; });
        if (line) {
            line.left = Math.min(line.left, r.left);
            line.right = Math.max(line.right, r.right);
            line.bottom = Math.max(line.bottom, r.bottom);
        } else {
            lines.push({top: r.top, bottom: r.bottom, left: r.left, right: r.right});
        }
    });

    var widest = lines.reduce(function(a, b) {
        return b.right - b.left > a.right - a.left ? b : a;
    });
    return new DOMRect(widest.left, widest.top, widest.right - widest.left, widest.bottom - widest.top);
}

function getRealRect(elm) {
    if (elm.childElementCount === 0) {
        var r = elm.getClientRects();
        if (r.length > 1) {
            return widestLineRect(r);
        } else {
            return elm.getBoundingClientRect();
        }
    } else if (elm.childElementCount === 1 && elm.firstElementChild.textContent) {
        var r = elm.firstElementChild.getBoundingClientRect();
        if (r.width < 4 || r.height < 4) {
            r = elm.getBoundingClientRect();
        }
        return r;
    } else {
        return elm.getBoundingClientRect();
    }
}

function isExplicitlyRequested(element) {
    return runtime.conf.clickableSelector &&
        element.matches(runtime.conf.clickableSelector);
}

function isElementAtPoint(e, x, y) {
    var el = e.getRootNode().elementFromPoint(x, y);
    return !el || el.shadowRoot && (el.childElementCount === 0 || el.shadowRoot.contains(e)) || el.contains(e) || e.contains(el);
}

/**
 * Test whether `e` is occluded by something else at every one of 5 sample
 * points (center + 4 inset corners) of its rect `be`. A single center-point
 * test (the old behavior) misses large "overlay" elements — e.g. a
 * full-card `<a>` whose visible content is a sibling layer drawn on top of
 * its center — that are still the real clickable target across most of
 * their area. Sampling the corners too means the element is only
 * considered occluded if nothing of it is clickable anywhere.
 *
 * @param {Element} e
 * @param {DOMRect} be
 * @returns {boolean}
 */
function isElementOccluded(e, be) {
    var inset = 2; // px, avoid landing exactly on a shared border with a neighboring element
    var points = [
        [be.left + be.width / 2, be.top + be.height / 2], // center
        [be.left + inset, be.top + inset],                 // top-left
        [be.right - inset, be.top + inset],                // top-right
        [be.left + inset, be.bottom - inset],               // bottom-left
        [be.right - inset, be.bottom - inset],              // bottom-right
    ];
    return !points.some(function(p) {
        return isElementAtPoint(e, p[0], p[1]);
    });
}

function filterOverlapElements(elements) {
    // filter out tiny elements
    elements = elements.filter(function(e) {
        var be = getRealRect(e);
        if (e.disabled || e.readOnly || !isElementDrawn(e, be)) {
            return false;
        } else if (e.matches("input, textarea, select, form")
            || e.contentEditable === "true" || isExplicitlyRequested(e)) {
            return true;
        } else {
            return !isElementOccluded(e, be);
        }
    });

    return filterAncestors(elements);
}

/**
 * Get all clickable elements. SurfingKeys has its own logic to identify clickable elements, such as a `HTMLAnchorElement` or elements with cursor as pointer. This function provides two parameters to identify those clickable elements that SurfingKeys failed to identify.
 *
 * @param {string} selectorString extra css selector of those clickable elements.
 * @param {regex} pattern a regular expression that matches text of the clickable elements.
 * @returns {array} array of clickable elements.
 *
 * @example
 * var elms = getClickableElements("[rel=link]", /click this/);
 */
function getClickableElements(selectorString, pattern) {
    var nodes = listElements(document.body, NodeFilter.SHOW_ELEMENT, function(n) {
        return n.offsetHeight && n.offsetWidth
            && getComputedStyle(n).cursor === "pointer"
            && (n.matches(selectorString)
                || pattern && (
                    pattern.test(n.textContent)
                    || pattern.test(n.getAttribute('aria-label')))
            );
    });
    return filterOverlapElements(nodes);
}

export {
    filterAncestors,
    getRealRect,
    filterOverlapElements,
    getClickableElements,
};
