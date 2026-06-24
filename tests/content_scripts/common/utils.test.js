describe('utils performance', () => {
    let isElementClickable, getZIndex;

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
});
