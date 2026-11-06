import { dispatchSKEvent, runtime } from '../runtime.js';
import Mode from '../mode';
import { startElementIndexWhenIdle } from '../elementIndex';
import { genLabels } from '../../../core/hintLabels';
import {
    createElementWithContent,
    filterInvisibleElements,
    getStructuralClickableSelector,
    initSKFunctionListener,
    refreshHints,
    setSanitizedContent,
} from '../utils.js';
import createRegionalHints from './regional.js';
import placeHintsHost from './host.js';
import hintsCss from './styles.js';
import installInputLayer from './inputLayer.js';
import installKeys from './keys.js';
import installMouseClick from './click.js';
import installPageNav from './pages.js';
import createRenderer from './render.js';
import { clickCandidates, textNodePositions } from './candidates.js';

function createHints(insert, normal, clipboard) {
    const self = new Mode("Hints");
    startElementIndexWhenIdle(getStructuralClickableSelector);
    const hintsHost = document.createElement("div");
    hintsHost.className = "surfingkeys_hints_host";
    hintsHost.attachShadow({ mode: 'open' });
    const hintsStyle = createElementWithContent('style', hintsCss);
    /* When the <style> loaded, set hints host's size */
    hintsStyle.onload = () => {
        /* Get height and width in integers */
        const height = Math.floor(document.documentElement.scrollTop +
            document.documentElement.clientHeight) - 1;
        const width = Math.floor(document.documentElement.scrollLeft +
            document.documentElement.clientWidth) - 1;

        /* Set height and width */
        hintsHost.style.height = `${height}px`;
        hintsHost.style.width = `${width}px`;
    }

    hintsHost.shadowRoot.appendChild(hintsStyle);
    const MOUSE_EVENTS = ['mouseover', 'pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click', 'focus', 'focusin'];
    const holder = createElementWithContent('section', '', {style: "display: block; opacity: 1;"});
    // Everything a hints session mutates, shared with keys.js and click.js.
    const st = {
        prefix: "",
        textFilter: "",
        lastMouseTarget: null,
        behaviours: { mouseEvents: MOUSE_EVENTS },
        shiftKey: false,
        containerCookieStoreId: null,
        lastCreateAttrs: {},
        onHintKey: null,
        cssSelector: "",
        numeric: false,
        characters: "asdfgqwertzxcvb",
        excludedScrollKeys: [],
        holder,
    };
    const regionalHints = createRegionalHints(clipboard, (...args) => renderer.createOverlay(...args));


    /**
     * Use digits as hint label, with it set you could type text to filter links, this API is to replace original setting like `Hints.numericHints = true;`.
     *
     * @name Hints.setNumeric
     *
     * @example
     * Hints.setNumeric();
     */
    self.setNumeric = function() {
        st.numeric = true;
    };
    /**
     * Set characters for generating hints, this API is to replace original setting like `Hints.characters = "asdgqwertzxcvb";`.
     *
     * @param {string} characters the characters for generating hints.
     * @name Hints.setCharacters
     *
     * @example
     * Hints.setCharacters("asdgqwertzxcvb");
     */
    self.setCharacters = function(chars) {
        st.characters = chars;
        for (const c of chars) {
            if (normal.isScrollKeyInHints(c)) {
                st.excludedScrollKeys.push(c);
            }
        }
    };
    self.getCharacters = () => {
        return st.characters;
    };

    installKeys(self, st, { insert, normal, hide, flip, handleHint, refreshByTextFilter });
    installMouseClick(self, st, { insert, normal, resetHints: () => resetHints() });
    st.onHintKey = self.dispatchMouseClick;

    var _styleForText = "", _styleForClick = "";
    const renderer = createRenderer({
        holder,
        hintsHost,
        genLabels: (n) => self.genLabels(n),
        behaviours: () => st.behaviours,
        styleForClick: () => _styleForClick,
        styleForText: () => _styleForText,
    });

    function handleHint(evt) {
        const hints = holder.querySelectorAll('div:not(:empty)');
        const hintState = refreshHints(hints, st.prefix);
        const elm = hintState.matched;
        if (elm) {
            normal.appendKeysForRepeat("Hints", st.prefix);
            if (typeof(st.onHintKey) === 'function') {
                if (st.behaviours.regionalHints) {
                    setTimeout(() => {
                        const overlay = renderer.createOverlay(elm, elm.skColorIndex, "99", new WeakMap());
                        overlay.link = elm;
                        regionalHints.attach(overlay);
                    }, 10);
                } else {
                    st.onHintKey(elm);
                }
            } else {
                // dispatch (element, shiftKey); the node can't cross scopes, so it rides as
                // the event target via the "__EVENT_TARGET__" placeholder
                if (elm.constructor.name === "Array") {
                    const target = elm[0];
                    elm[0] = "__EVENT_TARGET__";
                    dispatchSKEvent('user', ["onHintClicked", elm, st.shiftKey], target);
                } else {
                    dispatchSKEvent('user', ["onHintClicked", "__EVENT_TARGET__", st.shiftKey], elm);
                }
            }
            if (st.behaviours.multipleHits) {
                st.prefix = "";
                refreshHints(hints, st.prefix);
            } else {
                hide();
            }
        } else if (hintState.candidates === 0) {
            hide();
        }
        // suppress future key handler since the event has been treated as a hint
        if (evt) {
            Mode.suppressKeyUp(evt.keyCode);
            evt.stopImmediatePropagation();
            evt.preventDefault();
        }
    }

    function refreshByTextFilter() {
        var hints = holder.querySelectorAll('div');
        hints = Array.from(hints);
        if (st.textFilter.length > 0) {
            hints = hints.filter(function(hint) {
                hint.label = "";
                setSanitizedContent(hint, "");
                var e = hint.link;
                var text = e.innerText;
                if (text === undefined) {
                    text = e[0] ? e[0].textContent : "";
                }
                return text.indexOf(st.textFilter) !== -1;
            });
        }
        var hintLabels = self.genLabels(hints.length);
        hints.forEach(function(e, i) {
            e.label = hintLabels[i];
            setSanitizedContent(e, hintLabels[i]);
        });
    }

    function hide() {
        // To reset default behaviours here is necessary, as some hint my be hit without creation.
        st.behaviours = {
            mouseEvents: MOUSE_EVENTS
        };
        // Clean up temporary class added for array-based hint creation
        document.querySelectorAll('.surfingkeys--hints--creating').forEach(function(el) {
            el.classList.remove('surfingkeys--hints--creating');
        });
        setSanitizedContent(holder, "");
        holder.remove();
        hintsHost.remove();
        st.prefix = "";
        st.textFilter = "";
        st.shiftKey = false;
        self.exit();
    }

    function flip() {
        var hints = holder.querySelectorAll('div');
        if (hints[0].style.zIndex == hints[0].zIndex) {
            hints.forEach(function(hint, i) {
                var z = parseInt(hint.style.zIndex);
                hint.style.zIndex = hints.length - i + 2147483000 - z;
            });
        } else {
            hints.forEach(function(hint, i) {
                hint.style.zIndex = hint.zIndex;
            });
        }
    }

    function resetHints() {
        if (Mode.getCurrent() !== self || !document.documentElement.contains(hintsHost)) {
            return;
        }
        var start = new Date().getTime();
        var found = createHints(st.cssSelector, st.lastCreateAttrs);
        if (found > 0) {
            self.statusLine += " - " + (new Date().getTime() - start) + "ms / " + found;
            Mode.showStatus();
        }
    }



    installPageNav(self);

    self.onScrollStarted = () => {
        if (!document.documentElement.contains(hintsHost)) {
            return;
        }
        setSanitizedContent(holder, "");
        holder.remove();
        st.prefix = "";
    };

    self.onScrollDone = resetHints;

    initSKFunctionListener("hints", {
        scrollStarted: () => {
            const mode = Mode.getCurrent();
            if (mode.onScrollStarted) mode.onScrollStarted();
        },
        scrollDone: () => {
            const mode = Mode.getCurrent();
            if (mode.onScrollDone) mode.onScrollDone();
        },
        topBoundaryHit: self.previousPage,
        bottomBoundaryHit: self.nextPage,
        dispatchMouseClick: self.dispatchMouseClick,
    }, true);

    self.genLabels = function(total) {
        return genLabels(st.characters, total);
    };

    self.coordinate = renderer.coordinate;

    function createHintsForElements(elements, attrs) {
        attrs = attrs || {};
        for (var attr in attrs) {
            st.behaviours[attr] = attrs[attr];
        }
        self.statusLine = (attrs && attrs.statusLine) || "Hints to click";

        elements = filterInvisibleElements(elements);
        if (elements.length > 0) {
            renderer.placeHints(elements);
        }
        return elements.length;
    }

    function createHintsForClick(cssSelector, attrs) {
        attrs = attrs || {};
        self.statusLine = attrs.statusLine || "Hints to click";

        for (var attr in attrs) {
            st.behaviours[attr] = attrs[attr];
        }
        const elements = clickCandidates(cssSelector, st.behaviours);

        if (elements.length > 0) {
            renderer.placeHints(elements);
        }

        return elements.length;
    }

    function createHintsForTextNode(rxp, attrs) {
        for (var attr in attrs) {
            st.behaviours[attr] = attrs[attr];
        }
        self.statusLine = (attrs && attrs.statusLine) || "Hints to select text";

        return renderer.placeTextHints(textNodePositions(rxp));
    }

    function createHints(cssSelector, attrs) {
        placeHintsHost(hintsHost);
        if (cssSelector.constructor.name === "RegExp") {
            return createHintsForTextNode(cssSelector, attrs);
        } else if (Array.isArray(cssSelector)) {
            return createHintsForElements(cssSelector, attrs);
        }
        return createHintsForClick(cssSelector, attrs);
    }

    installInputLayer(self, st, renderer, { insert, normal, hintsHost });

    self.getSelector = function() {
        return st.cssSelector;
    };

    /**
     * Create hints for elements to click.
     *
     * @param cssSelector `string or array of HTMLElement`, if `links` is a string, it will be used as css selector.
     * @param {function} onHintKey a callback function on hint keys pressed.
     * @param {object} [attrs=null] `active`: whether to activate the new tab when a link is opened, `tabbed`: whether to open a link in a new tab, `multipleHits`: whether to stay in hints mode after one hint is triggered, `statusLine`: the text to show on the status bar while the hints are open.
     * @name Hints.create
     * @returns {Promise} which will be resolved how many hints are created.
     * @see Hints.dispatchMouseClick
     *
     * @example
     * mapkey('yA', '#7Copy a link URL to the clipboard', function() {
     *     Hints.create('*[href]', function(element) {
     *         Clipboard.write('[' + element.innerText + '](' + element.href + ')');
     *     });
     * });
     */
    self.create = function(cssSelector, onHintKey, attrs) {
        if (st.numeric) {
            st.characters = "1234567890";
        }

        // save last used attributes, which will be reused if the user scrolls while the hints are still open
        st.cssSelector = cssSelector;
        st.onHintKey = onHintKey;
        st.lastCreateAttrs = attrs || {};

        var start = new Date().getTime();
        var found = createHints(cssSelector, attrs);
        if (found > (runtime.conf.hintExplicit ? 0 : 1)) {
            self.statusLine += " - " + (new Date().getTime() - start) + "ms / " + found;
            self.enter();
        } else {
            handleHint();
        }
        dispatchSKEvent('user', ["onHintCreated", found]);
        const promise = new Promise((resolve, reject) => {
            resolve(found);
        });
        return promise;
    };


    /**
     * Set styles for hints.
     *
     * @param {string} css styles for hints.
     * @param {string} [mode=null] sub mode for hints, use `text` for hints mode to enter visual mode.
     * @name Hints.style
     *
     * @example
     * Hints.style('border: solid 3px #552a48; color:#efe1eb; background: none; background-color: #552a48;');
     * Hints.style("div{border: solid 3px #707070; color:#efe1eb; background: none; background-color: #707070;} div.begin{color:red;}", "text");
     */
    self.style = function(css, mode) {
        if (!/^div\b/.test(css)) {
            css = `div{${css}}`;
        }

        if (mode === "text") {
            _styleForText = css.replace(/\bdiv\b/g, "[mode='text'] div");
        } else {
            _styleForClick = css.replace(/\bdiv\b/g, "div");
        }
    };

    self.feedkeys = function(keys) {
        setTimeout(function() {
            st.prefix = keys.toUpperCase();
            handleHint();
        }, 1);
    };

    return self;
}

export default createHints;