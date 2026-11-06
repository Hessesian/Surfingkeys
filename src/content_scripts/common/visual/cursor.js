import { dispatchSKEvent } from '../runtime.js';
import { locateFocusNode } from '../utils.js';

// The caret drawn in visual mode and the styles for it and the match marks.
export default function installCursor(self, st) {
    const selection = st.selection, cursor = st.cursor;

    self.hideCursor = function () {
        if (document.body.contains(cursor)) {
            cursor.remove();
            dispatchSKEvent("front", ['hideBubble']);
        }
    };

    self.showCursor = function () {
        if (selection.focusNode && (selection.focusNode.offsetHeight > 0 || selection.focusNode.parentNode.offsetHeight > 0)) {
            // https://developer.mozilla.org/en-US/docs/Web/API/Selection
            // If focusNode is a text node, this is the number of characters within focusNode preceding the focus. If focusNode is an element, this is the number of child nodes of the focusNode preceding the focus.
            let r = locateFocusNode(selection)
            if (r) {
                cursor.style.position = "fixed";
                cursor.style.left = r.left + 'px';
                cursor.style.top = r.top + 'px';
                cursor.style.height = r.height + 'px';
            }

            document.body.appendChild(cursor);
        }
    };
    self.getCursorPixelPos = function () {
        return cursor.getBoundingClientRect();
    };

    var _style = {};
    /**
     * Set styles for visual mode.
     *
     * @param {string} element element in visual mode, which can be `marks` and `cursor`.
     * @param {string} style css style
     * @name Visual.style
     *
     * @example
     * Visual.style('marks', 'background-color: #89a1e2;');
     * Visual.style('cursor', 'background-color: #9065b7;');
     */
    self.style = function (element, style) {
        _style[element] = style;

        cursor.setAttribute('style', _style.cursor || '');
        st.markTemplate.setAttribute('style', _style.marks || '');
    };
}
