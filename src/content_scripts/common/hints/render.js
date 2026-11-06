import { runtime } from '../runtime.js';
import { hintLeft, nudgeHint } from '../../../core/hintLabels';
import {
    createElementWithContent,
    getColor,
    getRealRect,
    getTextNodePos,
    getZIndex,
    setSanitizedContent,
} from '../utils.js';

// Draws hints into `holder` (inside `hintsHost`'s shadow root). Everything that changes
// between sessions is read through ctx at the moment it is needed, not captured:
// `behaviours` is replaced on every hide(), and the styles when Hints.style is called.
//   ctx = {holder, hintsHost, genLabels(n), behaviours(), styleForClick(), styleForText()}
export default function createRenderer(ctx) {
    const { holder, hintsHost } = ctx;

    function initHolder(mode) {
        setSanitizedContent(holder, "");
        holder.setAttribute('mode', mode);
        holder.style.display = "";
    }

    function coordinate() {
        // a hack to get co-ordinate
        var link = createElementWithContent('div', 'A', {style: "top: 0; left: 0;"});
        holder.prepend(link);
        hintsHost.shadowRoot.appendChild(holder);
        var br = link.getBoundingClientRect();
        var ret = {
            top: br.top + window.pageYOffset - document.documentElement.clientTop,
            left: br.left + window.pageXOffset - document.documentElement.clientLeft
        };
        setSanitizedContent(holder, "");
        holder.remove();
        return ret;
    }

    function createOverlay(e, i, alpha, zIndexCache) {
        e.skColorIndex = i;

        const be = e.getBoundingClientRect();
        const z = getZIndex(e, zIndexCache);

        const width = be.width - 4;
        const height = be.height - 4;
        const frame = document.createElement('mask');
        frame.style.position = "fixed";
        frame.style.top = Math.max(0, Math.min(be.top, window.innerHeight - height)) + "px";
        frame.style.left = Math.max(0, Math.min(be.left, window.innerWidth - width)) + "px";
        frame.style.width = width + "px";
        frame.style.height = height + "px";
        frame.style.zIndex = z + 9999;
        frame.style.background = getColor(i) + alpha;
        frame.style.border = `2px solid ${getColor(i)}`;
        return frame;
    }

    function placeHints(elements) {
        initHolder('click');
        const hintLabels = ctx.genLabels(elements.length);
        const bof = coordinate();
        const style = createElementWithContent("style", ctx.styleForClick());
        holder.prepend(style);
        const zIndexCache = new WeakMap();
        const behaviours = ctx.behaviours();
        if (behaviours.regionalHints) {
            elements.forEach(function(e, i) {
                holder.append(createOverlay(e, i, "33", zIndexCache));
            });
        }

        let lastTop = -1, lastLeft = -1;
        var links = elements.map(function(elm, i) {
            var r = getRealRect(elm),
                z = getZIndex(elm, zIndexCache);
            let left = hintLeft(runtime.conf.hintAlign, r.left, r.width, bof.left,
                window.pageXOffset, window.innerWidth);
            var link = createElementWithContent('div', hintLabels[i]);
            if (elm.dataset.hint_scrollable) { link.classList.add('hint-scrollable'); }
            let lTop = Math.max(r.top + window.pageYOffset - bof.top, 0);
            ({ top: lTop, left } = nudgeHint(lTop, left, lastTop, lastLeft));
            link.style.top = lTop + "px";
            link.style.left = left + "px";
            link.style.zIndex = z + 9999;
            if (behaviours.regionalHints) {
                link.style.background = getColor(i);
            }
            link.zIndex = link.style.zIndex;
            link.label = hintLabels[i];
            link.link = elm;

            lastTop = lTop;
            lastLeft = left;
            return link;
        });
        links.forEach(function(link) {
            holder.appendChild(link);
        });
        var hints = holder.querySelectorAll('div');
        var bcr = getRealRect(hints[0]);
        for (var i = 1; i < hints.length; i++) {
            var h = hints[i];
            var tcr = getRealRect(h);
            if (tcr.top === bcr.top && Math.abs(tcr.left - bcr.left) < bcr.width) {
                h.style.top = h.offsetTop + h.offsetHeight + "px";
            }
            bcr = getRealRect(h);
        }
        hintsHost.shadowRoot.appendChild(holder);
    }

    // The hint labels for the `positions` of textNodePositions, in a holder of their own.
    function placeTextHints(positions) {
        const zIndexCache = new WeakMap();
        let elements = positions.map(function(e) {
            var pos = getTextNodePos(e[0], e[1]);
            var caretViewport = [0, 0, window.innerHeight, window.innerWidth];
            if (runtime.conf.caretViewport && runtime.conf.caretViewport.length === 4) {
                caretViewport = runtime.conf.caretViewport;
            }
            if (e[0].data.trim().length === 0
                || pos.top < caretViewport[0]
                || pos.left < caretViewport[1]
                || pos.top > caretViewport[2]
                || pos.left > caretViewport[3]) {
                return null;
            } else {
                var z = getZIndex(e[0].parentNode, zIndexCache);
                var link = document.createElement('div');
                if (e[1] === 0) {
                    link.className = "begin";
                }
                link.style.position = "fixed";
                link.style.top = pos.top + "px";
                link.style.left = pos.left + "px";
                link.style.zIndex = z + 9999;
                link.zIndex = link.style.zIndex;
                link.link = e;
                return link;
            }
        }).filter(function(e) {
            return e !== null;
        });
        if (document.getSelection().anchorNode) {
            document.getSelection().collapseToStart();
        }

        if (elements.length > 0) {
            initHolder('text');
            var hintLabels = ctx.genLabels(elements.length);
            elements.forEach(function(e, i) {
                e.label = hintLabels[i];
                setSanitizedContent(e, hintLabels[i]);
                holder.append(e);
            });

            var style = createElementWithContent('style', ctx.styleForText());
            holder.prepend(style);
            hintsHost.shadowRoot.appendChild(holder);
        }

        return elements.length;
    }

    // A mask over each editable of `elements`, the first one active (the caller focuses it).
    function placeInputMasks(elements, lastCreateAttrs) {
        initHolder('input');
        const zIndexCache = new WeakMap();
        elements.forEach(function(e, i) {
            var be = e.getBoundingClientRect();
            var z = getZIndex(e, zIndexCache);

            var mask = document.createElement('mask');
            mask.style.position = "fixed";
            mask.style.top = be.top + "px";
            mask.style.left = be.left + "px";
            mask.style.width = be.width + "px";
            mask.style.height = be.height + "px";
            mask.style.zIndex = z + 9999;
            mask.link = e;
            holder.append(mask);
        });
        hintsHost.shadowRoot.appendChild(holder);
        lastCreateAttrs.activeInput = 0;
        const ai = holder.querySelector('[mode=input]>mask');
        ai.classList.add("activeInput");
        return ai;
    }

    return { initHolder, coordinate, createOverlay, placeHints, placeTextHints, placeInputMasks };
}
