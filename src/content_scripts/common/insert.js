import Trie from './trie';
import { runtime } from './runtime.js';
import Mode from './mode';
import KeyboardUtils from './keyboardUtils';
import {
    createElementWithContent,
    getRealEdit,
    isEditable,
    llmRequest,
    locateFocusNode,
    replaceEditableSelection,
    scrollIntoViewIfNeeded,
    setSanitizedContent,
} from './utils.js';
import CursorPrompt from './cursorPrompt';
import { fieldCaretAfterMove, fieldRange } from '../../core/textEdit';

function createInsert() {
    var self = new Mode("Insert");

    function moveCursorEOL() {
        var element = getRealEdit();
        if (element.setSelectionRange !== undefined) {
            setFieldSelection(element, element.value.length, element.value.length);
        } else if (isEditable(element)) {
            // for contenteditable div
            if (element.childNodes.length > 0) {
                var node = element.childNodes[element.childNodes.length -1];
                if (node.nodeType === Node.TEXT_NODE) {
                    document.getSelection().setPosition(node, node.data.length);
                } else {
                    let codeMirrorNode = node.querySelector(".CodeMirror-line")
                    if (codeMirrorNode) {
                        setEndOfContenteditable(element)
                    } else {
                        document.getSelection().setPosition(node, node.childNodes.length);
                    }
                }
            }
        }
    }

    // From https://stackoverflow.com/questions/1125292/how-to-move-cursor-to-end-of-contenteditable-entity/69727327#69727327
    function setEndOfContenteditable(contentEditableElement) {
        let range = document.createRange();//Create a range (a range is a like the selection but invisible)
        range.selectNodeContents(contentEditableElement);//Select the entire contents of the element with the range
        range.collapse(false);//collapse the range to the end point. false means collapse to end rather than the start
        let selection = window.getSelection();//get the selection object (allows you to change selection)
        selection.removeAllRanges();//remove any selections already made
        selection.addRange(range);//make the range you have just created the visible selection
    }

    // Fields whose type has no selection (email, number, ...) throw on setSelectionRange.
    function setFieldSelection(element, start, end) {
        try {
            element.setSelectionRange(start, end);
            return true;
        } catch (err) {
            if (err instanceof DOMException && err.name === "InvalidStateError") {
                return false;
            }
            throw err;
        }
    }

    // In a contenteditable, select the target the way the browser renders it. A line
    // may span several nodes, so its start is the browser's lineboundary, not offset 0.
    function selectInContentEditable(element, target, alter) {
        const selection = document.getSelection();
        switch (target) {
            case "lineStart":
                selection.collapse(selection.focusNode, selection.focusOffset);
                selection.modify(alter, "backward", "lineboundary");
                break;
            case "end":
                moveCursorEOL();
                break;
            case "wordBack":
                selection.modify(alter, "backward", "word");
                break;
            case "wordForward":
                selection.modify(alter, "forward", "word");
                break;
            case "all":
                selection.selectAllChildren(element);
                break;
        }
    }

    // The one place insert-mode commands touch the page.
    function runEdit(element, command) {
        const field = element.setSelectionRange !== undefined;
        if (command.type === "move") {
            if (command.to === "end") {
                moveCursorEOL();
            } else if (field) {
                const caret = fieldCaretAfterMove(element.value, element.selectionStart, command.to);
                setFieldSelection(element, caret, caret);
            } else {
                selectInContentEditable(element, command.to, "move");
            }
            return;
        }
        if (field) {
            // select() and the current selection work even where setSelectionRange throws.
            if (command.target === "all") {
                element.select();
            } else if (command.target !== "selection") {
                const [start, end] = fieldRange(element.value, element.selectionStart, element.selectionEnd, command.target);
                if (!setFieldSelection(element, start, end)) {
                    return;
                }
            }
        } else {
            selectInContentEditable(element, command.target, "extend");
        }
        replaceEditableSelection(element, command.text);
    }

    const editKeys = [
        ["<Ctrl-e>", "Move the cursor to the end of the line", { type: "move", to: "end" }],
        [KeyboardUtils.platform === "Windows" ? "<Ctrl-f>" : "<Ctrl-a>", "Move the cursor to the beginning of the line", { type: "move", to: "lineStart" }],
        ["<Ctrl-u>", "Delete all entered characters before the cursor", { type: "replace", target: "lineStart", text: "" }],
        ["<Alt-b>", "Move the cursor Backward 1 word", { type: "move", to: "wordBack" }],
        ["<Alt-f>", "Move the cursor Forward 1 word", { type: "move", to: "wordForward" }],
        ["<Alt-w>", "Delete a word backwards", { type: "replace", target: "wordBack", text: "" }],
        ["<Alt-d>", "Delete a word forwards", { type: "replace", target: "wordForward", text: "" }],
    ];

    self.mappings = new Trie();
    self.map_node = self.mappings;
    for (const [key, annotation, command] of editKeys) {
        self.mappings.add(KeyboardUtils.encodeKeystroke(key), {
            annotation,
            feature_group: 15,
            code: () => runEdit(getRealEdit(), command),
        });
    }
    self.mappings.add(KeyboardUtils.encodeKeystroke("<Esc>"), {
        annotation: "Exit insert mode",
        feature_group: 15,
        stopPropagation: function(key) {
            // return true only if bind key is not an ASCII key
            // so that imap(',,', "<Esc>") won't leave a comma in input
            return key.charCodeAt(0) < 256;
        },
        code: function() {
            getRealEdit().blur();
            self.exit();
        }
    });

    self.mappings.add(KeyboardUtils.encodeKeystroke("<Ctrl-g>"), {
        annotation: "Correct grammar of the input with LLM",
        feature_group: 15,
        code: function() {
            const element = getRealEdit();
            const text = element.value !== undefined ? element.value : element.innerText;
            if (!text || !text.trim()) {
                return;
            }
            const messages = [
                {role: "system", content: "You are a grammar checker. Correct grammar errors in the given text and reply with only the corrected text, keeping the original wording and tone."},
                {role: "user", content: text}
            ];
            let corrected = "";
            llmRequest(messages, (chunk) => {
                corrected += chunk;
            }, () => {
                corrected = corrected.trim();
                if (!corrected) {
                    return;
                }
                element.focus();
                runEdit(element, { type: "replace", target: "all", text: corrected });
            });
        }
    });

    const emojiURL = chrome.runtime.getURL("pages/emoji.tsv");
    const emojiPrompt = new CursorPrompt((c) => {
        const ee = c.split("\t");
        const parsedUnicodeEmoji = String.fromCodePoint.apply(null, ee[0].split(','));
        return "<div><span>{0}</span>{1}</div>".format(parsedUnicodeEmoji, ee[1]);
    }, (elm) => {
        return elm.firstElementChild.innerText;
    }, () => new Promise((r) => {
        fetch(emojiURL)
            .then(res => Promise.all([res.text()]))
            .then(res => {
                r(res[0].split("\n"));
            });
    }));

    self.enableEmojiInsertion = () => {
        self.mappings.add(":", {
            annotation: "Input emoji",
            feature_group: 15,
            stopPropagation: function() {
                return false;
            },
            code: function() {
                setTimeout(() => {
                    emojiPrompt.activate(getRealEdit(), undefined, runtime.conf.startToShowEmoji, -1);
                }, 100);
            }
        });
    };

    self.addEventListener('keydown', function(event) {
        if (event.key && event.key.charCodeAt(0) > 127) {
            // IME is opened.
            event.sk_suppressed = true;
            return;
        }
        if (document.activeElement === document.body) {
            // Nothing at all has focus - unlike checking whether a resolved
            // target merely *looks* non-editable (removed as an exit signal
            // because it misfires on real editable targets behind shadow-DOM
            // retargeting), this can only be true when focus has genuinely
            // gone nowhere, e.g. a SPA removed/replaced the focused element
            // during a re-render. Safe to exit, and don't swallow this
            // keystroke - let it fall through to Normal mode.
            self.exit();
            return;
        }
        // prevent this event to be handled by Surfingkeys' other listeners
        var realTarget = getRealEdit(event);
        if (isEditable(realTarget) && event.sk_keyName.length) {
            Mode.handleMapKey.call(self, event, function(last) {
                // for insert mode to insert unmapped chars with preceding chars same as some mapkeys
                // such as, to insert `,m` in case of mapkey `,,` defined.
                var pw = last.getPrefixWord();
                if (pw) {
                    runEdit(getRealEdit(), { type: "replace", target: "selection", text: pw });
                }
            });
        }
        event.sk_suppressed = true;
    });
    self.addEventListener('focus', function(event) {
        if (document.activeElement === document.body) {
            self.exit();
        } else {
            event.sk_suppressed = true;
        }
    });
    self.addEventListener('mousedown', function(event) {
        // Only a real, physical mouse click can exit Insert mode here —
        // event.isTrusted guards against a page script dispatching a
        // synthetic mousedown to fake the user clicking away. A focus or
        // keydown event whose target merely *looks* non-editable is not
        // trustworthy on its own (see the removed exit branches above):
        // it can be triggered by the page's own re-renders, or by
        // getRealEdit() resolving through a shadow-DOM wrapper that isn't
        // itself editable even though a real editable element is nested
        // inside it.
        if (event.isTrusted && !isEditable(getRealEdit(event))) {
            self.exit();
        } else {
            event.sk_suppressed = true;
        }
    });

    var _element;
    var _enter = self.enter;
    self.enter = function(elm, keepCursor) {
        if (elm === document.body) {
            runtime.conf.showModeStatus = false;
        }
        var changed = (_enter.call(self, 0, true) === -1);
        if (_element !== elm) {
            _element = elm;
            changed = true;
        }
        if (changed && !keepCursor && runtime.conf.cursorAtEndOfInput && elm.nodeName !== 'SELECT') {
            moveCursorEOL();
        }
    };

    return self;
}

export default createInsert;
