describe('insert mode exit conditions', () => {
    let insert, Mode;

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
        insert = require('src/content_scripts/common/insert.js').default();
    });

    afterEach(() => {
        document.body.innerHTML = '';
        insert.exit();
    });

    function makeTextarea() {
        const el = document.createElement('textarea');
        document.body.appendChild(el);
        return el;
    }

    test('typing into a textarea keeps Insert mode active', () => {
        const textarea = makeTextarea();
        insert.enter(textarea, true);
        expect(Mode.getCurrent()).toBe(insert);

        insert.eventListeners['keydown']({ key: 'a', sk_keyName: '', target: textarea });

        expect(Mode.getCurrent()).toBe(insert);
    });

    test('Escape exits Insert mode', () => {
        const textarea = makeTextarea();
        insert.enter(textarea, true);
        expect(Mode.getCurrent()).toBe(insert);

        insert.exit();

        expect(Mode.getCurrent()).not.toBe(insert);
    });

    test('a trusted mousedown on a non-editable element exits Insert mode', () => {
        const textarea = makeTextarea();
        const nonEditable = document.createElement('div');
        document.body.appendChild(nonEditable);
        insert.enter(textarea, true);
        expect(Mode.getCurrent()).toBe(insert);

        insert.eventListeners['mousedown']({ isTrusted: true, target: nonEditable });

        expect(Mode.getCurrent()).not.toBe(insert);
    });

    test('a trusted mousedown on a different editable element does not exit Insert mode', () => {
        const textarea = makeTextarea();
        const otherTextarea = makeTextarea();
        insert.enter(textarea, true);
        expect(Mode.getCurrent()).toBe(insert);

        insert.eventListeners['mousedown']({ isTrusted: true, target: otherTextarea });

        expect(Mode.getCurrent()).toBe(insert);
    });

    test('a focus event resolving to a non-editable target does not exit Insert mode (regression)', () => {
        const textarea = makeTextarea();
        const shadowWrapper = document.createElement('div');
        document.body.appendChild(shadowWrapper);
        insert.enter(textarea, true);
        expect(Mode.getCurrent()).toBe(insert);

        // Simulates getRealEdit() resolving to a non-editable shadow-DOM
        // wrapper instead of the real contenteditable element inside it
        // (the actual bug on Microsoft Teams).
        insert.eventListeners['focus']({ target: shadowWrapper });

        expect(Mode.getCurrent()).toBe(insert);
    });

    test('a keydown event resolving to a non-editable target does not exit Insert mode', () => {
        const textarea = makeTextarea();
        const nonEditable = document.createElement('div');
        document.body.appendChild(nonEditable);
        insert.enter(textarea, true);
        expect(Mode.getCurrent()).toBe(insert);

        insert.eventListeners['keydown']({ key: 'a', sk_keyName: '', target: nonEditable });

        expect(Mode.getCurrent()).toBe(insert);
    });
});
