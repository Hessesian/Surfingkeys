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
