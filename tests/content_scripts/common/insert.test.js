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
        el.focus();
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

    test('losing focus entirely (e.g. a SPA removes the focused element on re-render) exits Insert mode and does not swallow the keystroke', () => {
        const textarea = makeTextarea();
        insert.enter(textarea, true);
        expect(Mode.getCurrent()).toBe(insert);

        // Simulates a hydrated SPA (Teams, GitHub) replacing the focused
        // node during a re-render: focus reverts to <body> with no Escape
        // and no trusted click, so those two exit signals never fire.
        textarea.blur();
        expect(document.activeElement).toBe(document.body);

        const event = { key: 'f', sk_keyName: 'f', target: document.body };
        insert.eventListeners['keydown'](event);

        expect(Mode.getCurrent()).not.toBe(insert);
        expect(event.sk_suppressed).not.toBe(true);
    });
});
