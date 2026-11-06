describe('utils performance', () => {
    let isElementClickable, getZIndex, getStructuralClickableSelector, isElementClickableByCursor;

    beforeAll(() => {
        global.chrome = {
            runtime: {
                sendMessage: jest.fn(),
                onMessage: {
                    addListener: jest.fn()
                }
            },
            extension: {
                getURL: jest.fn()
            }
        };
        global.DOMRect = jest.fn();

        const utils = require('src/content_scripts/common/utils.js');
        isElementClickable = utils.isElementClickable;
        getZIndex = utils.getZIndex;
        getStructuralClickableSelector = utils.getStructuralClickableSelector;
        isElementClickableByCursor = utils.isElementClickableByCursor;
    });

    test('isElementClickable reads computed style only once per element', () => {
        document.body.innerHTML = '<div id="target"></div>';
        const target = document.getElementById('target');

        const realGetComputedStyle = window.getComputedStyle;
        const spy = jest.fn((elm) => realGetComputedStyle(elm));
        window.getComputedStyle = spy;

        isElementClickable(target);

        window.getComputedStyle = realGetComputedStyle;

        expect(spy).toHaveBeenCalledTimes(1);
    });

    test('getZIndex caches computed style per node across calls sharing ancestors', () => {
        document.body.innerHTML = '<div id="grandparent"><div id="parent"><div id="childA"></div><div id="childB"></div></div></div>';
        const childA = document.getElementById('childA');
        const childB = document.getElementById('childB');

        const realGetComputedStyle = window.getComputedStyle;
        const spy = jest.fn((elm) => realGetComputedStyle(elm));
        window.getComputedStyle = spy;

        const cache = new WeakMap();
        getZIndex(childA, cache);
        spy.mockClear();
        getZIndex(childB, cache);

        window.getComputedStyle = realGetComputedStyle;

        // childB's own z-index must be read, but parent/grandparent were already
        // cached while resolving childA, so they must not be read again.
        expect(spy).toHaveBeenCalledTimes(1);
        expect(spy).toHaveBeenCalledWith(childB);
    });

    test('getStructuralClickableSelector returns a selector that matches anchors', () => {
        document.body.innerHTML = '<a id="link" href="#"></a><div id="plain"></div>';
        const selector = getStructuralClickableSelector();
        expect(document.getElementById('link').matches(selector)).toBe(true);
        expect(document.getElementById('plain').matches(selector)).toBe(false);
    });

    test('isElementClickableByCursor detects cursor:pointer styling on a non-semantic div', () => {
        document.body.innerHTML = '<div id="fake-button" style="cursor: pointer;"></div><div id="plain"></div>';
        expect(isElementClickableByCursor(document.getElementById('fake-button'))).toBe(true);
        expect(isElementClickableByCursor(document.getElementById('plain'))).toBe(false);
    });

    test('isElementClickable still returns true via the cursor fallback (unchanged public behavior)', () => {
        document.body.innerHTML = '<div id="fake-button" style="cursor: pointer;"></div>';
        expect(isElementClickable(document.getElementById('fake-button'))).toBe(true);
    });
});

describe('querySelectorAllDeep', () => {
    let querySelectorAllDeep;

    beforeAll(() => {
        global.chrome = {
            runtime: { sendMessage: jest.fn(), onMessage: { addListener: jest.fn() } },
            extension: { getURL: jest.fn() }
        };
        global.DOMRect = jest.fn();
        querySelectorAllDeep = require('src/content_scripts/common/utils.js').querySelectorAllDeep;
    });

    test('matches elements in the light DOM', () => {
        document.body.innerHTML = '<a id="a1" href="#"></a><div></div><a id="a2" href="#"></a>';
        const result = querySelectorAllDeep('a');
        expect(result.map((e) => e.id).sort()).toEqual(['a1', 'a2']);
    });

    test('matches elements nested inside a shadow root', () => {
        document.body.innerHTML = '<div id="host"></div>';
        const host = document.getElementById('host');
        const root = host.attachShadow({ mode: 'open' });
        root.innerHTML = '<a id="shadow-link" href="#"></a>';

        const result = querySelectorAllDeep('a');
        expect(result.map((e) => e.id)).toEqual(['shadow-link']);
    });
});

describe('getVisibleElementsBySelector', () => {
    let getVisibleElementsBySelector;
    let realGetBoundingClientRect;

    beforeAll(() => {
        global.chrome = {
            runtime: { sendMessage: jest.fn(), onMessage: { addListener: jest.fn() } },
            extension: { getURL: jest.fn() }
        };
        global.DOMRect = jest.fn();
        getVisibleElementsBySelector = require('src/content_scripts/common/utils.js').getVisibleElementsBySelector;
        realGetBoundingClientRect = Element.prototype.getBoundingClientRect;
    });

    afterEach(() => {
        Element.prototype.getBoundingClientRect = realGetBoundingClientRect;
    });

    function mockOnscreenRect() {
        Element.prototype.getBoundingClientRect = function() {
            return { top: 0, bottom: 10, left: 0, right: 10, width: 10, height: 10 };
        };
    }

    test('only returns elements matching the selector that are on screen', () => {
        document.body.innerHTML = '<a id="onscreen" href="#"></a><div id="not-a-link"></div>';
        mockOnscreenRect();

        const result = getVisibleElementsBySelector('a');
        expect(result.map((e) => e.id)).toEqual(['onscreen']);
    });

    test('excludes elements with zero-height rects (offscreen/collapsed)', () => {
        document.body.innerHTML = '<a id="collapsed" href="#"></a>';
        Element.prototype.getBoundingClientRect = function() {
            return { top: 0, bottom: 0, left: 0, right: 0, width: 0, height: 0 };
        };

        const result = getVisibleElementsBySelector('a');
        expect(result).toEqual([]);
    });

    test('applies the optional extraFilter after the visibility check', () => {
        document.body.innerHTML = '<input id="enabled"><input id="disabled" disabled>';
        mockOnscreenRect();

        const result = getVisibleElementsBySelector('input', (e) => !e.disabled);
        expect(result.map((e) => e.id)).toEqual(['enabled']);
    });
});

describe('filterOverlapElements occlusion sampling', () => {
    let filterOverlapElements;
    let realGetBoundingClientRect, realElementFromPoint, realGetComputedStyle;

    beforeAll(() => {
        global.chrome = {
            runtime: { sendMessage: jest.fn(), onMessage: { addListener: jest.fn() } },
            extension: { getURL: jest.fn() }
        };
        global.DOMRect = jest.fn();

        filterOverlapElements = require('src/content_scripts/common/utils.js').filterOverlapElements;

        realGetBoundingClientRect = Element.prototype.getBoundingClientRect;
        Element.prototype.getBoundingClientRect = function() {
            return this._rect || { top: 0, left: 0, width: 100, height: 100, bottom: 100, right: 100 };
        };

        // jsdom's getComputedStyle() leaves `opacity` as "" instead of the
        // browser default of "1", which makes isElementDrawn() treat every
        // element as invisible (parseFloat("") > 0.1 is false). Patch only
        // that gap, matching the same workaround used in hints.test.js.
        realGetComputedStyle = window.getComputedStyle;
        window.getComputedStyle = function(elm, pseudoElt) {
            const style = realGetComputedStyle(elm, pseudoElt);
            if (style.opacity === "") {
                Object.defineProperty(style, 'opacity', { value: "1", configurable: true });
            }
            return style;
        };

        realElementFromPoint = document.elementFromPoint;
    });

    afterAll(() => {
        Element.prototype.getBoundingClientRect = realGetBoundingClientRect;
        document.elementFromPoint = realElementFromPoint;
        window.getComputedStyle = realGetComputedStyle;
    });

    afterEach(() => {
        document.body.innerHTML = '';
    });

    function makeCandidate(rect) {
        const el = document.createElement('a');
        el.href = '#';
        el._rect = rect;
        document.body.appendChild(el);
        return el;
    }

    test('keeps a candidate whose center is occluded by a sibling but a corner is clear', () => {
        const candidate = makeCandidate({ top: 0, left: 0, width: 100, height: 100, bottom: 100, right: 100 });
        const sibling = document.createElement('div');
        sibling._rect = { top: 40, left: 40, width: 20, height: 20, bottom: 60, right: 60 };
        document.body.appendChild(sibling);

        document.elementFromPoint = function(x, y) {
            // Sibling covers only the 40-60 region (the center); corners (near 0,0 / 0,100 / 100,0 / 100,100) are clear.
            if (x >= 40 && x <= 60 && y >= 40 && y <= 60) {
                return sibling;
            }
            return candidate;
        };

        const result = filterOverlapElements([candidate]);

        expect(result).toEqual([candidate]);
    });

    test('filters out a candidate occluded at every sample point by the same covering element', () => {
        const candidate = makeCandidate({ top: 0, left: 0, width: 100, height: 100, bottom: 100, right: 100 });
        const cover = document.createElement('div');
        cover._rect = { top: 0, left: 0, width: 200, height: 200, bottom: 200, right: 200 };
        document.body.appendChild(cover);

        document.elementFromPoint = function() {
            return cover;
        };

        const result = filterOverlapElements([candidate]);

        expect(result).toEqual([]);
    });

    test('keeps a candidate with no occlusion at any point', () => {
        const candidate = makeCandidate({ top: 0, left: 0, width: 100, height: 100, bottom: 100, right: 100 });

        document.elementFromPoint = function() {
            return candidate;
        };

        const result = filterOverlapElements([candidate]);

        expect(result).toEqual([candidate]);
    });
});

describe('replaceEditableSelection', () => {
    let replaceEditableSelection, skEventName, textarea, sent;
    const record = (type) => (evt) => sent.push([type, evt.detail[0]]);

    beforeAll(() => {
        global.chrome = {
            runtime: { sendMessage: jest.fn(), onMessage: { addListener: jest.fn() } },
            extension: { getURL: jest.fn() }
        };
        global.DOMRect = jest.fn();
        replaceEditableSelection = require('src/content_scripts/common/utils.js').replaceEditableSelection;
        skEventName = require('src/content_scripts/common/runtime.js').skEventName;
        document.addEventListener(skEventName('normal'), record('normal'));
        document.addEventListener(skEventName('front'), record('front'));
    });

    beforeEach(() => {
        sent = [];
        document.body.innerHTML = '<textarea>hello world</textarea>';
        textarea = document.querySelector('textarea');
        document.execCommand = jest.fn(() => true);
        jest.useRealTimers();
    });

    test('deleting a collapsed selection is a no-op, not a backspace', () => {
        textarea.setSelectionRange(3, 3);
        expect(replaceEditableSelection(textarea, '')).toBe(true);
        expect(document.execCommand).not.toHaveBeenCalled();
    });

    test('edits go through execCommand so the editor sees input events', () => {
        textarea.setSelectionRange(0, 5);
        expect(replaceEditableSelection(textarea, '')).toBe(true);
        expect(document.execCommand).toHaveBeenCalledWith('delete', false, '');
        replaceEditableSelection(textarea, 'hi');
        expect(document.execCommand).toHaveBeenCalledWith('insertText', false, 'hi');
        expect(sent).toEqual([]);
    });

    test('a rejected edit writes nothing and disables Surfingkeys on the field', () => {
        document.execCommand = jest.fn(() => false);
        textarea.setSelectionRange(0, 5);
        expect(replaceEditableSelection(textarea, '')).toBe(false);
        expect(textarea.value).toBe('hello world');
        expect(sent).toEqual([['front', 'showBanner'], ['normal', 'disableOnFocusedElement']]);
    });

    test('an edit the editor swallows is reported once the field is seen unchanged', () => {
        jest.useFakeTimers();
        const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
        textarea.setSelectionRange(0, 5);
        expect(replaceEditableSelection(textarea, '')).toBe(true);
        expect(sent).toEqual([]);
        jest.advanceTimersByTime(100);
        expect(sent).toEqual([['front', 'showBanner'], ['normal', 'disableOnFocusedElement']]);
        expect(warn.mock.calls[0][0]).toMatch('content unchanged');
        warn.mockRestore();
        jest.useRealTimers();
    });

    test('an edit applied a moment later is not reported', () => {
        jest.useFakeTimers();
        textarea.setSelectionRange(0, 5);
        replaceEditableSelection(textarea, '');
        textarea.value = ' world';
        jest.advanceTimersByTime(100);
        expect(sent).toEqual([]);
        jest.useRealTimers();
    });
});
