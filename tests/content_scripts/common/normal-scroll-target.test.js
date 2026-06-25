describe('normal scroll target routing', () => {
    let normal, Mode;

    beforeAll(() => {
        global.chrome = {
            runtime: {
                sendMessage: jest.fn(),
                getURL: jest.fn(),
                onMessage: { addListener: jest.fn() }
            },
            extension: { getURL: jest.fn() }
        };
        global.DOMRect = jest.fn();

        Mode = require('src/content_scripts/common/mode.js').default;
        Mode.init();
        const insert = require('src/content_scripts/common/insert.js').default();
        normal = require('src/content_scripts/common/normal.js').default(insert);

        // jsdom does not implement scrollIntoView; changeScrollTarget() calls it
        // via scrollIntoViewIfNeeded() on the (mocked) scrollable element.
        Element.prototype.scrollIntoView = jest.fn();
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    test('"cs" (change scroll target) uses the full scan, not the fast path', () => {
        const fastSpy = jest.spyOn(Mode, 'getScrollableElements').mockReturnValue([]);
        const fullSpy = jest.spyOn(Mode, 'getAllScrollableElements').mockReturnValue([document.createElement('div')]);

        normal.enter();
        document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'c' }));
        document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 's' }));

        expect(fullSpy).toHaveBeenCalled();
        expect(fastSpy).not.toHaveBeenCalled();
    });

    test('refreshScrollableElements uses the full scan, not the fast path', () => {
        const fastSpy = jest.spyOn(Mode, 'getScrollableElements').mockReturnValue([]);
        const fullSpy = jest.spyOn(Mode, 'getAllScrollableElements').mockReturnValue([document.createElement('div')]);

        normal.refreshScrollableElements();

        expect(fullSpy).toHaveBeenCalled();
        expect(fastSpy).not.toHaveBeenCalled();
    });
});
