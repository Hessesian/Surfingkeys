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
