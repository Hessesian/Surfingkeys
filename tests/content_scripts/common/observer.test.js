describe('observer modal detection', () => {
    let startScrollNodeObserver, normal;
    let realGetBoundingClientRect;

    beforeAll(() => {
        global.chrome = {
            runtime: {
                sendMessage: jest.fn(),
                onMessage: { addListener: jest.fn() }
            },
            extension: { getURL: jest.fn() }
        };
        global.DOMRect = jest.fn();

        startScrollNodeObserver = require('src/content_scripts/common/observer.js').default;

        realGetBoundingClientRect = Element.prototype.getBoundingClientRect;
        Element.prototype.getBoundingClientRect = function() {
            return { top: 0, left: 0, width: 400, height: 400, bottom: 400, right: 400 };
        };

        // initSKFunctionListener (utils.js) registers a new document-level listener
        // on every startScrollNodeObserver call and never removes the previous one,
        // so this suite must reuse a single instance across tests instead of
        // re-invoking startScrollNodeObserver per test (which would accumulate
        // listeners and break event delivery to later tests' instances).
        normal = { addScrollableElement: jest.fn() };
        startScrollNodeObserver(normal);
    });

    afterAll(() => {
        Element.prototype.getBoundingClientRect = realGetBoundingClientRect;
    });

    beforeEach(() => {
        document.body.innerHTML = '';
        normal.addScrollableElement = jest.fn();
        document.dispatchEvent(new CustomEvent('surfingkeys:observer', { detail: ['turnOn'] }));
    });

    afterEach(() => {
        document.dispatchEvent(new CustomEvent('surfingkeys:observer', { detail: ['turnOff'] }));
    });

    function makeModalDiv(id) {
        const div = document.createElement('div');
        div.id = id;
        div.style.position = 'relative';
        div.style.overflowY = 'scroll';
        Object.defineProperty(div, 'scrollTop', { value: 16, writable: true, configurable: true });
        return div;
    }

    test('detects a directly-added scrollable modal-like element', async () => {
        const modal = makeModalDiv('modal');
        document.body.appendChild(modal);

        await new Promise((r) => setTimeout(r, 250));

        expect(normal.addScrollableElement).toHaveBeenCalledWith(modal);
    });

    test('detects a scrollable modal nested inside an added wrapper', async () => {
        const wrapper = document.createElement('div');
        const modal = makeModalDiv('nested-modal');
        wrapper.appendChild(modal);
        document.body.appendChild(wrapper);

        await new Promise((r) => setTimeout(r, 250));

        expect(normal.addScrollableElement).toHaveBeenCalledWith(modal);
    });

    test('does not call addScrollableElement for a small added element', async () => {
        const small = document.createElement('div');
        small.style.position = 'relative';
        small.getBoundingClientRect = () => ({ top: 0, left: 0, width: 10, height: 10, bottom: 10, right: 10 });
        document.body.appendChild(small);

        await new Promise((r) => setTimeout(r, 250));

        expect(normal.addScrollableElement).not.toHaveBeenCalled();
    });

    test('does not call addScrollableElement when nothing is added', async () => {
        await new Promise((r) => setTimeout(r, 250));

        expect(normal.addScrollableElement).not.toHaveBeenCalled();
    });

    test('does not call addScrollableElement for an element positioned entirely below the viewport', async () => {
        const offscreen = makeModalDiv('below-the-fold');
        offscreen.getBoundingClientRect = () => ({ top: 900, left: 0, width: 400, height: 350, bottom: 1250, right: 400 });
        document.body.appendChild(offscreen);

        await new Promise((r) => setTimeout(r, 250));

        expect(normal.addScrollableElement).not.toHaveBeenCalled();
    });
});
