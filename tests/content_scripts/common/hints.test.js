describe('hints click detection', () => {
    let hints, runtime, Mode;
    let realGetBoundingClientRect, realGetComputedStyle;

    beforeAll(() => {
        global.chrome = {
            runtime: {
                sendMessage: jest.fn(),
                onMessage: { addListener: jest.fn() },
                getURL: jest.fn()
            },
            extension: { getURL: jest.fn() }
        };
        global.DOMRect = jest.fn();

        runtime = require('src/content_scripts/common/runtime.js').runtime;
        Mode = require('src/content_scripts/common/mode.js').default;
        Mode.init();
        const insert = require('src/content_scripts/common/insert.js').default();
        const normal = require('src/content_scripts/common/normal.js').default(insert);
        hints = require('src/content_scripts/common/hints.js').default(insert, normal, {});

        realGetBoundingClientRect = Element.prototype.getBoundingClientRect;
        Element.prototype.getBoundingClientRect = function() {
            return { top: 0, bottom: 10, left: 0, right: 10, width: 10, height: 10 };
        };

        // jsdom's getComputedStyle() leaves `opacity` as "" instead of the
        // browser default of "1", which makes isElementDrawn() treat every
        // element as invisible (parseFloat("") > 0.1 is false). Patch only
        // that gap; everything else (e.g. inline `cursor`) is computed
        // correctly by jsdom already.
        realGetComputedStyle = window.getComputedStyle;
        window.getComputedStyle = function(elm, pseudoElt) {
            const style = realGetComputedStyle(elm, pseudoElt);
            if (style.opacity === "") {
                Object.defineProperty(style, 'opacity', { value: "1", configurable: true });
            }
            return style;
        };

        // jsdom doesn't implement elementFromPoint; filterOverlapElements()
        // calls it to detect occlusion. Returning null treats every element
        // as unoccluded, matching the simple non-overlapping fixtures here.
        if (!document.elementFromPoint) {
            document.elementFromPoint = function() { return null; };
        }
        if (typeof ShadowRoot !== 'undefined' && !ShadowRoot.prototype.elementFromPoint) {
            ShadowRoot.prototype.elementFromPoint = function() { return null; };
        }
    });

    afterAll(() => {
        Element.prototype.getBoundingClientRect = realGetBoundingClientRect;
        window.getComputedStyle = realGetComputedStyle;
    });

    afterEach(() => {
        document.body.innerHTML = '';
        if (Mode.getCurrent() === hints) {
            hints.exit();
        }
        runtime.conf.detectClickableByCursor = false;
    });

    test('finds structurally clickable elements regardless of detectClickableByCursor', async () => {
        document.body.innerHTML = '<a id="a1" href="#"></a><a id="a2" href="#"></a><div id="plain"></div>';

        const found = await hints.create("", function() {});
        expect(found).toBe(2);
    });

    test('ignores a non-semantic cursor:pointer div by default', async () => {
        document.body.innerHTML = '<a id="a1" href="#"></a><a id="a2" href="#"></a><div id="fake-button" style="cursor: pointer;"></div>';
        runtime.conf.detectClickableByCursor = false;

        const found = await hints.create("", function() {});
        expect(found).toBe(2);
    });

    test('includes a non-semantic cursor:pointer div when detectClickableByCursor is enabled', async () => {
        document.body.innerHTML = '<a id="a1" href="#"></a><a id="a2" href="#"></a><div id="fake-button" style="cursor: pointer;"></div>';
        runtime.conf.detectClickableByCursor = true;

        const found = await hints.create("", function() {});
        expect(found).toBe(3);
    });

    test('falls back to the cursor heuristic automatically when the page has no structurally-clickable elements at all', async () => {
        document.body.innerHTML = '<div id="fake1" style="cursor: pointer;"></div><div id="fake2" style="cursor: pointer;"></div><div id="plain"></div>';
        runtime.conf.detectClickableByCursor = false;

        const found = await hints.create("", function() {});
        expect(found).toBe(2);
    });
});
