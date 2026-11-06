import { dispatchSKEvent, runtime } from '../runtime.js';
import { showBanner } from './ui.js';

/**
 * Replace the current selection in `element` with `text` (empty deletes it), the
 * way typing would. Rich editors (Teams, Slack, ProseMirror, Lexical) keep their own
 * model of the text and update it only from input events; writing `value`, `data`
 * or `innerText` changes the screen but not that model, so the editor later restores
 * what it still holds. execCommand is the only API that fires trusted input events.
 * If the editor refuses it, nothing is written and Surfingkeys steps out of this
 * field, since any direct write would desync it again.
 *
 * @param {Element} element the editable element whose selection is replaced.
 * @param {string} text
 * @returns {boolean} whether the edit was applied.
 */
function editorClaims(range, text, collapsed) {
    const node = range.startContainer;
    const target = node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement;
    if (text.includes("\n")) {
        // An inserted "\n" stays a character inside one paragraph; editors build
        // paragraphs or line breaks only from pasted text.
        const clipboardData = new DataTransfer();
        clipboardData.setData("text/plain", text);
        const paste = new ClipboardEvent("paste", { bubbles: true, cancelable: true, composed: true, clipboardData });
        target.dispatchEvent(paste);
        if (paste.defaultPrevented) {
            return true;
        }
    }
    const event = new InputEvent("beforeinput", {
        bubbles: true,
        cancelable: true,
        composed: true,
        inputType: text ? (collapsed ? "insertText" : "insertReplacementText") : "deleteContentBackward",
        data: text || null,
        targetRanges: [new StaticRange(range)],
    });
    target.dispatchEvent(event);
    return event.defaultPrevented;
}

function replaceEditableSelection(element, text, deferred) {
    const field = element.setSelectionRange !== undefined;
    if (!field && !deferred && text.includes("\n") && document.getSelection().rangeCount) {
        // Multi-line text goes in as a paste, which carries no target range: the editor
        // pastes at its own idea of the selection, and that catches up with a selection
        // set from script only on its selectionchange, a task later. The caller may move
        // the caret meanwhile, so the range is put back first.
        const range = document.getSelection().getRangeAt(0).cloneRange();
        setTimeout(() => {
            const selection = document.getSelection();
            selection.removeAllRanges();
            selection.addRange(range);
            setTimeout(() => replaceEditableSelection(element, text, true), 0);
        }, 0);
        return true;
    }
    const selection = document.getSelection();
    const collapsed = field ? element.selectionStart === element.selectionEnd : selection.isCollapsed;
    // "delete" on a collapsed selection deletes the character before the caret.
    if (!text && collapsed) {
        return true;
    }
    // A rich editor may cancel the input event and apply the edit from its own model,
    // possibly a frame later, so success is judged by the field's content afterwards.
    const host = field ? element : (document.activeElement && document.activeElement.isContentEditable ? document.activeElement : element);
    const content = () => field ? host.value : host.textContent;
    const before = content();
    const command = text ? "insertText" : "delete";
    const detail = { command, text, selected: field ? host.value.slice(host.selectionStart, host.selectionEnd) : selection.toString(), element };
    const reject = (reason) => {
        console.warn(`Surfingkeys: ${command} in an editable did not apply (${reason})`, detail);
        showBanner("This field rejected Surfingkeys' edit. Surfingkeys is off here until you leave the field.", 3000);
        dispatchSKEvent("normal", ['disableOnFocusedElement']);
    };
    // Model-driven editors (CKEditor, Lexical, Slate, ...) apply edits from beforeinput
    // and revert DOM changes they did not make, and execCommand fires no beforeinput.
    // So offer the edit as beforeinput first; execCommand only if no editor claims it.
    if (!field && selection.rangeCount && editorClaims(selection.getRangeAt(0), text, collapsed)) {
        return true;
    }
    if (!document.execCommand(command, false, text)) {
        reject("execCommand returned false");
        return false;
    }
    if (content() === before) {
        setTimeout(() => {
            // A re-rendered editor may have replaced the host; that is not a rejection.
            if (host.isConnected && content() === before) {
                reject("content unchanged");
            }
        }, 100);
    }
    return true;
}

function getRealEdit(event) {
    var rt = event ? event.target : document.activeElement;
    // on some pages like chrome://history/, input is in shadowRoot of several other recursive shadowRoots.
    while (rt && rt.shadowRoot) {
        if (rt.shadowRoot.activeElement) {
            rt = rt.shadowRoot.activeElement;
        } else if (rt.shadowRoot.querySelector('input, textarea, select')) {
            rt = rt.shadowRoot.querySelector('input, textarea, select');
            break;
        } else {
            break;
        }
    }
    if (rt === window) {
        rt = document.body;
    }
    return rt;
}

function toggleQuote() {
    var elm = getRealEdit(), val = elm.value;
    if (val.match(/^"|"$/)) {
        elm.value = val.replace(/^"?(.*?)"?$/, '$1');
    } else {
        elm.value = '"' + val + '"';
    }
}

function isEditable(element) {
    return element
        && !element.disabled && (element.localName === 'textarea'
        || element.localName === 'select'
        || element.isContentEditable
        || (element.matches && element.matches(runtime.conf.editableSelector))
        || (element.localName === 'input' && /^(?!button|checkbox|file|hidden|image|radio|reset|submit)/i.test(element.type)));
}

function getCssSelectorsOfEditable() {
    return "input:not([type=submit]), textarea, *[contenteditable=true], *[role=textbox], select, div.ace_cursor";
}

function rotateInput(inputs, backward, curr, str) {
    let list = inputs;
    if (str) {
        list = inputs.filter((l) => l.indexOf(str) === 0 && l !== str);
        if (curr > list.length) {
            curr = list.length;
        }
    }
    const delta = backward ? -1 : 1;
    const length = list.length + 1; // +1 for empty input
    curr = (curr + length + delta) % length;
    return [curr < list.length ? list[curr] : str, curr];
}

export {
    replaceEditableSelection,
    getRealEdit,
    toggleQuote,
    isEditable,
    getCssSelectorsOfEditable,
    rotateInput,
};
