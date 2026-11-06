// The scroll target and how it moves: which element Normal mode scrolls, and the
// smooth-scroll animation. How far a command moves is decided in core/scroll.ts.
import { RUNTIME, dispatchSKEvent, runtime } from './runtime.js';
import Mode from './mode';
import { isElementPartiallyInViewport, scrollIntoViewIfNeeded } from './utils.js';
import { DIRECTION, boundaryHit, clampScroll, scrollDelta, smoothDuration } from '../../core/scroll';

export default function createScroller(highlightElement) {
    let nodes = null, index = 0;
    // 0 while no scroll key is held; counts animation frames past a step's end while held.
    let keyHeld = 0;
    const isPage = (elm) => elm === document.scrollingElement;

    function setNodes(list) {
        nodes = list;
        nodes.forEach((n) => {
            n.removeEventListener('mousedown', onMousedown);
            n.addEventListener('mousedown', onMousedown);
            n.dataset.hint_scrollable = true;
        });
        index = 0;
    }

    function ensureNodes() {
        if (!nodes || nodes.length === 0) {
            setNodes(Mode.getScrollableElements());
        }
    }

    // A click inside a scrollable region makes the innermost one the target.
    function onMousedown(e) {
        if (!e.currentTarget.contains(e.target)) return;
        let i = nodes.lastIndexOf(e.target);
        for (let j = nodes.length - 1; j >= 0 && i === -1; j--) {
            if (nodes[j] !== document.body && nodes[j].contains(e.target)) i = j;
        }
        if (i !== -1) index = i;
    }

    function current() {
        ensureNodes();
        return nodes.length > 0 ? nodes[index] : document.scrollingElement;
    }

    // document.scrollingElement is null while body has overflow auto; visible restores it.
    function pageElement() {
        if (!document.scrollingElement && document.body) {
            document.body.style.overflow = 'visible';
        }
        return document.scrollingElement;
    }

    function stale(n) {
        if (isPage(n) || n === document.body) return false;
        const br = n.getBoundingClientRect();
        return br.width === 0 || br.height === 0 || !isElementPartiallyInViewport(n)
            || !Mode.hasScroll(n, 'x', 16) && !Mode.hasScroll(n, 'y', 16);
    }

    function canScroll(n, direction) {
        const page = isPage(n) || n === document.body;
        return direction === 'vertical'
            ? n.scrollHeight > (page ? window.innerHeight : n.clientHeight) + 1
            : n.scrollWidth > (page ? window.innerWidth : n.clientWidth) + 1;
    }

    function setClamped(elm, prop, value, increasing) {
        const max = prop === 'scrollTop'
            ? elm.scrollHeight - (isPage(elm) ? window.innerHeight : elm.clientHeight)
            : elm.scrollWidth - (isPage(elm) ? window.innerWidth : elm.clientWidth);
        const r = clampScroll(value, max, increasing);
        elm[prop] = r.value;
        return r.hit;
    }

    // While the key is held the step keeps going past its distance, slowed by scrollFriction.
    function smoothScrollBy(elm, x, y, duration) {
        if (keyHeld) return;
        const [prop, distance] = y ? ['scrollTop', y] : ['scrollLeft', x];
        let previous = 0, origin = elm[prop], completed = false;
        keyHeld = 1;
        function step(t) {
            if (previous === 0) {
                previous = t;
                dispatchSKEvent("hints", ['scrollStarted']);
                return window.requestAnimationFrame(step);
            }
            const old = elm[prop], delta = (t - previous) * distance / duration;
            let hit = false;
            if (Math.abs(old + delta - origin) >= Math.abs(distance)) {
                completed = true;
                if (keyHeld > runtime.conf.scrollFriction) {
                    hit = setClamped(elm, prop, old + delta, distance > 0);
                    origin = elm[prop];
                } else if (keyHeld > 0) {
                    keyHeld++;
                } else {
                    hit = setClamped(elm, prop, origin + distance, distance > 0);
                }
            } else {
                hit = setClamped(elm, prop, old + delta, distance > 0);
            }
            previous = t;
            if (!keyHeld && (hit || completed)) {
                elm.style.scrollBehavior = '';
                dispatchSKEvent("hints", ['scrollDone']);
            } else {
                window.requestAnimationFrame(step);
            }
        }
        elm.style.scrollBehavior = 'auto';
        window.requestAnimationFrame(step);
    }

    function scroll(type) {
        let n = current();
        if (stale(n)) {
            // The page has changed under the target.
            setNodes(Mode.getAllScrollableElements());
            n = nodes[index];
        }
        n = n || pageElement();
        if (!n) return; // a frameset page has nothing to scroll
        if (runtime.conf.scrollFallback && !isPage(n) && n !== document.body
            && DIRECTION[type] && !canScroll(n, DIRECTION[type])) {
            n = pageElement();
        }
        const page = isPage(n);
        const [x, y] = scrollDelta(type, {
            scrollTop: n.scrollTop, scrollLeft: n.scrollLeft,
            scrollHeight: n.scrollHeight, scrollWidth: n.scrollWidth,
            width: page ? window.innerWidth : n.offsetWidth,
            height: page ? window.innerHeight : n.offsetHeight,
        }, runtime.conf.scrollStepSize, RUNTIME.repeats);
        n.lastScrollTop = n.scrollTop;
        n.lastScrollLeft = n.scrollLeft;
        const edge = runtime.conf.smartPageBoundary && (page || nodes.length === 1 && n === nodes[0])
            && boundaryHit(n.scrollTop, n.scrollHeight, n.clientHeight, y);
        if (edge) {
            // Hints mode turns a push against the page edge into previous/next page.
            dispatchSKEvent("hints", [edge === "top" ? 'topBoundaryHit' : 'bottomBoundaryHit']);
        } else {
            if (RUNTIME.repeats > 1 || type === "byRatio") {
                RUNTIME.repeats = 0;
            }
            if (runtime.conf.smoothScroll) {
                smoothScrollBy(n, x, y, smoothDuration(x, y));
            } else {
                dispatchSKEvent("hints", ['scrollStarted']);
                n.scrollBy({ behavior: 'instant', left: x, top: y });
                dispatchSKEvent("hints", ['scrollDone']);
            }
        }
        dispatchSKEvent("observer", ['turnOff']);
    }

    return {
        scroll,
        current,
        // The key that drove a smooth scroll was released.
        release() { keyHeld = 0; },
        refresh() {
            setNodes(Mode.getAllScrollableElements());
            return nodes;
        },
        add(elm) {
            if (!nodes || !elm.contains(nodes[index]) && nodes.indexOf(elm) === -1) {
                ensureNodes();
                nodes.push(elm);
                index = nodes.length - 1;
            }
        },
        next(silent) {
            nodes = Mode.getAllScrollableElements();
            if (nodes.length > 0) {
                index = (index + 1) % nodes.length;
                scrollIntoViewIfNeeded(nodes[index]);
                if (!silent) highlightElement(nodes[index]);
            }
        },
        reset() {
            nodes = null;
            ensureNodes();
            if (nodes.length > 0) highlightElement(nodes[index]);
        },
        // `''` mark: swap the target's position with where the last scroll started.
        swapLastPosition() {
            ensureNodes();
            const n = nodes[index];
            if (n && n.lastScrollTop !== undefined && n.lastScrollLeft !== undefined) {
                [n.scrollTop, n.lastScrollTop] = [n.lastScrollTop, n.scrollTop];
                [n.scrollLeft, n.lastScrollLeft] = [n.lastScrollLeft, n.scrollLeft];
            }
        },
    };
}
