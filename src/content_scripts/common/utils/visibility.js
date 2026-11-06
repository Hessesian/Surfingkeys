import { runtime } from '../runtime.js';
import { isEditable } from './editing.js';

function listElements(root, whatToShow, filter) {
    const elms = [];
    let currentNode;
    const nodeIterator = document.createNodeIterator(
        root,
        whatToShow,
        null
    );

    while (currentNode = nodeIterator.nextNode()) {
        filter(currentNode) && elms.push(currentNode);

        if (currentNode.shadowRoot) {
            elms.push(...listElements(currentNode.shadowRoot, whatToShow, filter));
        }
    }

    return elms;
}

function isElementVisible(elm) {
    return elm.offsetHeight > 0 && elm.offsetWidth > 0;
}

/**
 * The CSS selector for elements that are clickable purely by markup
 * (semantic tags, ARIA roles, or `runtime.conf.clickableSelector`).
 * This selector is safe to pass to `querySelectorAll` directly, unlike
 * the cursor-based heuristic in `isElementClickableByCursor`.
 *
 * @returns {string}
 */
function getStructuralClickableSelector() {
    var cssSelector = "a, button, select, input, textarea, summary, *[onclick], *[contenteditable=true], *.jfk-button, *.goog-flat-menu-button, *[role=button], *[role=link], *[role=menuitem], *[role=option], *[role=switch], *[role=tab], *[role=checkbox], *[role=combobox], *[role=menuitemcheckbox], *[role=menuitemradio]";
    if (runtime.conf.clickableSelector.length) {
        cssSelector += ", " + runtime.conf.clickableSelector;
    }
    return cssSelector;
}

/**
 * Detect elements that are clickable only by virtue of computed style
 * (`cursor: pointer` or a custom cursor image) or by being a descendant
 * of a clickable container. This cannot be expressed as a CSS selector,
 * so checking it for every element on a page requires visiting every
 * element — callers should only do that when
 * `runtime.conf.detectClickableByCursor` is enabled.
 *
 * @param {Element} e
 * @returns {boolean}
 */
function isElementClickableByCursor(e) {
    var cursor = getComputedStyle(e).cursor;
    return cursor === "pointer"
        || cursor.substr(0, 4) === "url("
        || e.closest("a, *[onclick], *[contenteditable=true], *.jfk-button, *.goog-flat-menu-button") !== null;
}

function isElementClickable(e) {
    return e.matches(getStructuralClickableSelector()) || isElementClickableByCursor(e);
}

/**
 * Get the cumulative z-index of an element by walking up its ancestor chain,
 * using `cache` to avoid recomputing the (expensive) computed style of
 * ancestors shared between multiple elements within the same call site.
 *
 * @param {Element} node
 * @param {WeakMap} cache a fresh WeakMap per hint-generation pass.
 * @returns {number}
 */
function getZIndex(node, cache) {
    if (cache.has(node)) {
        return cache.get(node);
    }
    var i = parseInt(getComputedStyle(node).getPropertyValue('z-index'));
    var z = (isNaN(i) || i < 0) ? 0 : i;
    var parent = node.parentNode;
    if (parent && parent !== document.body && parent !== document && parent.nodeType !== node.DOCUMENT_FRAGMENT_NODE) {
        z += getZIndex(parent, cache);
    }
    cache.set(node, z);
    return z;
}

function scrollIntoViewIfNeeded(elm, ignoreSize) {
    if (elm.scrollIntoViewIfNeeded) {
        elm.scrollIntoViewIfNeeded();
    } else if (!isElementPartiallyInViewport(elm, ignoreSize)) {
        elm.scrollIntoView();
    }
}

function isElementDrawn(e, rect) {
    var min = isEditable(e) ? 1 : 4;
    rect = rect || e.getBoundingClientRect();
    return rect.width > min && rect.height > min && (parseFloat(getComputedStyle(e).opacity) > 0.1 || e.tagName == "INPUT" && e.type != "text");
}

/**
 * Check whether an element is in viewport.
 *
 * @param {Element} el the element to be checked.
 * @param {boolean} [ignoreSize=false] whether to ignore size of the element, otherwise the element must be with size 4*4.
 * @returns {boolean}
 *
 */
function isElementPartiallyInViewport(el, ignoreSize) {
    var rect = el.getBoundingClientRect();
    var windowHeight = (window.innerHeight || document.documentElement.clientHeight);
    var windowWidth = (window.innerWidth || document.documentElement.clientWidth);

    return (ignoreSize || isElementDrawn(el, rect))
        && (rect.top < windowHeight) && (rect.bottom > 0)
        && (rect.left < windowWidth) && (rect.right > 0);
}

function getVisibleElements(filter) {
    var all = Array.from(document.documentElement.getElementsByTagName("*"));
    var visibleElements = [];
    for (var i = 0; i < all.length; i++) {
        var e = all[i];
        // include elements in a shadowRoot.
        if (e.shadowRoot) {
            var cc = e.shadowRoot.querySelectorAll('*');
            for (var j = 0; j < cc.length; j++) {
                all.push(cc[j]);
            }
        }
        var rect = e.getBoundingClientRect();
        if ( (rect.top <= window.innerHeight) && (rect.bottom >= 0)
            && (rect.left <= window.innerWidth) && (rect.right >= 0)
            && rect.height > 0
            && getComputedStyle(e).visibility !== 'hidden'
        ) {
            filter(e, visibleElements);
        }
    }
    return visibleElements;
}

/**
 * Find every shadow root nested anywhere under `root` (recursively).
 * Walking `root.querySelectorAll('*')` to find shadow hosts is cheap —
 * it's a property read per element, not a forced style/layout
 * computation — unlike the per-element `getBoundingClientRect`/
 * `getComputedStyle` calls in `getVisibleElements`.
 *
 * @param {Document|ShadowRoot} root
 * @returns {Array<ShadowRoot>}
 */
function getShadowRootsDeep(root) {
    var roots = [];
    var hosts = root.querySelectorAll('*');
    for (var i = 0; i < hosts.length; i++) {
        if (hosts[i].shadowRoot) {
            roots.push(hosts[i].shadowRoot);
            roots = roots.concat(getShadowRootsDeep(hosts[i].shadowRoot));
        }
    }
    return roots;
}

/**
 * Like `document.querySelectorAll(cssSelector)`, but also matches inside
 * every shadow root in the document.
 *
 * @param {string} cssSelector
 * @returns {Array<Element>}
 */
function querySelectorAllDeep(cssSelector) {
    var result = Array.from(document.querySelectorAll(cssSelector));
    var shadowRoots = getShadowRootsDeep(document);
    for (var i = 0; i < shadowRoots.length; i++) {
        result = result.concat(Array.from(shadowRoots[i].querySelectorAll(cssSelector)));
    }
    return result;
}

/**
 * Like `getVisibleElements`, but starts from the (usually much smaller)
 * set of elements matching `cssSelector` instead of scanning every
 * element in the document. Use this whenever the desired elements can be
 * expressed as a CSS selector — it avoids the expensive
 * `getBoundingClientRect`/`getComputedStyle` calls for every irrelevant
 * node on the page.
 *
 * @param {string} cssSelector
 * @param {function(Element): boolean} [extraFilter] optional predicate
 *   applied after the viewport/visibility check.
 * @returns {Array<Element>}
 */
function getVisibleElementsBySelector(cssSelector, extraFilter) {
    var candidates = querySelectorAllDeep(cssSelector);
    var visibleElements = [];
    for (var i = 0; i < candidates.length; i++) {
        var e = candidates[i];
        var rect = e.getBoundingClientRect();
        if ((rect.top <= window.innerHeight) && (rect.bottom >= 0)
            && (rect.left <= window.innerWidth) && (rect.right >= 0)
            && rect.height > 0
            && getComputedStyle(e).visibility !== 'hidden'
            && (!extraFilter || extraFilter(e))
        ) {
            visibleElements.push(e);
        }
    }
    return visibleElements;
}

/**
 * Get large elements that are currently visible in the viewport.
 * A large element is defined as one that takes up a significant portion of the viewport.
 *
 * @param {number} [minWidth=0.3] Minimum width as a fraction of viewport width (0.0 to 1.0)
 * @param {number} [minHeight=0.3] Minimum height as a fraction of viewport height (0.0 to 1.0)
 * @returns {Array<Element>} Array of large visible elements
 *
 * @example
 * // Get elements that are at least 30% of viewport dimensions
 * var largeElements = getLargeElements();
 *
 * // Get elements that are at least 50% of viewport dimensions
 * var veryLargeElements = getLargeElements(0.5, 0.5);
 */
function getLargeElements(minWidth = 0.3, minHeight = 0.3) {
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const minWidthPx = viewportWidth * minWidth;
    const minHeightPx = viewportHeight * minHeight;

    let lastRect = new DOMRect(0, 0, 0, 0);
    let elements = getVisibleElements((element, visibleElements) => {
        if (element === document.body) return;
        const rect = element.getBoundingClientRect();
        const tolerance = 16;
        if (Math.abs(rect.x - lastRect.x) < tolerance
            && Math.abs(rect.y - lastRect.y) < tolerance
            && Math.abs(rect.width - lastRect.width) < tolerance
            && Math.abs(rect.height - lastRect.height) < tolerance) {
            return;
        }
        if (Math.abs(viewportWidth - rect.width) < 4
            && Math.abs(viewportHeight - rect.height) < 4) {
            return;
        }
        if (rect.width < minWidthPx && rect.height < minHeightPx) return;
        if ((rect.width / viewportWidth) * (rect.height / viewportHeight) < minWidth * minHeight / 6) return;
        const style = getComputedStyle(element);
        if (style.opacity > 0.1 && style.visibility !== 'hidden' && style.display !== 'none') {
            visibleElements.push(element);
            lastRect = rect;
        }
    });
    return elements;
}

////////////////////////////////////////////////////////////////////////////////

function getElements(selectorString) {
    return listElements(document.body, NodeFilter.SHOW_ELEMENT, function(n) {
        return n.offsetHeight && n.offsetWidth && n.matches(selectorString);
    });
}

function filterInvisibleElements(nodes) {
    return nodes.filter(function(n) {
        return n.offsetHeight && n.offsetWidth
            && !n.getAttribute('disabled') && isElementPartiallyInViewport(n)
            && getComputedStyle(n).visibility !== 'hidden';
    });
}

export {
    listElements,
    getStructuralClickableSelector,
    isElementClickableByCursor,
    isElementClickable,
    getZIndex,
    scrollIntoViewIfNeeded,
    isElementDrawn,
    isElementPartiallyInViewport,
    getVisibleElements,
    getShadowRootsDeep,
    querySelectorAllDeep,
    getVisibleElementsBySelector,
    getLargeElements,
    getElements,
    filterInvisibleElements,
};
