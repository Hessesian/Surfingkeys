describe('Mode.getScrollableElements fast path', () => {
    let Mode;
    let realGetBoundingClientRect, realElementFromPoint, realGetComputedStyle;

    beforeAll(() => {
        global.chrome = {
            runtime: {
                sendMessage: jest.fn(),
                onMessage: { addListener: jest.fn() }
            },
            extension: { getURL: jest.fn() }
        };
        global.DOMRect = jest.fn();

        Mode = require('src/content_scripts/common/mode.js').default;

        realGetBoundingClientRect = Element.prototype.getBoundingClientRect;
        Element.prototype.getBoundingClientRect = function() {
            return { top: 0, left: 0, width: 100, height: 100, bottom: 100, right: 100 };
        };

        realGetComputedStyle = window.getComputedStyle;
        window.getComputedStyle = function(elm) {
            const style = realGetComputedStyle(elm);
            if (style.opacity === '') {
                return new Proxy(style, {
                    get(target, prop) {
                        return prop === 'opacity' ? '1' : target[prop];
                    }
                });
            }
            return style;
        };

        realElementFromPoint = document.elementFromPoint;
    });

    afterAll(() => {
        Element.prototype.getBoundingClientRect = realGetBoundingClientRect;
        window.getComputedStyle = realGetComputedStyle;
        document.elementFromPoint = realElementFromPoint;
    });

    afterEach(() => {
        document.body.innerHTML = '';
    });

    function makeScrollableDiv(id, scrollHeight) {
        const div = document.createElement('div');
        div.id = id;
        div.style.overflowY = 'scroll';
        Object.defineProperty(div, 'scrollHeight', { value: scrollHeight, configurable: true });
        Object.defineProperty(div, 'scrollTop', { value: 16, writable: true, configurable: true });
        return div;
    }

    test('finds a scrollable ancestor of the viewport-center element without a full scan', () => {
        const outer = document.createElement('div');
        const scrollable = makeScrollableDiv('panel', 1000);
        const inner = document.createElement('span');
        scrollable.appendChild(inner);
        outer.appendChild(scrollable);
        document.body.appendChild(outer);

        document.elementFromPoint = () => inner;

        const result = Mode.getScrollableElements();

        expect(result).toEqual([scrollable]);
    });

    test('falls back to a full-document scan when the viewport-center chain has no scrollable ancestor', () => {
        const centerEl = document.createElement('div');
        document.body.appendChild(centerEl);

        const elsewhere = makeScrollableDiv('elsewhere-panel', 1000);
        document.body.appendChild(elsewhere);

        document.elementFromPoint = () => centerEl;

        const result = Mode.getScrollableElements();

        expect(result).toEqual([elsewhere]);
    });

    test('still places document.scrollingElement first when the page itself scrolls', () => {
        const scrollable = makeScrollableDiv('panel', 1000);
        document.body.appendChild(scrollable);
        document.elementFromPoint = () => scrollable;

        const realScrollingElementDesc = Object.getOwnPropertyDescriptor(Document.prototype, 'scrollingElement');
        const fakeScrollingElement = { scrollHeight: 5000, scrollWidth: 0 };
        Object.defineProperty(document, 'scrollingElement', {
            value: fakeScrollingElement,
            configurable: true
        });

        const result = Mode.getScrollableElements();

        expect(result[0]).toBe(fakeScrollingElement);
        expect(result).toContain(scrollable);

        delete document.scrollingElement;
        if (realScrollingElementDesc) {
            Object.defineProperty(Document.prototype, 'scrollingElement', realScrollingElementDesc);
        }
    });
});
