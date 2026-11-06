import { getTextRect, setSanitizedContent } from '../utils.js';

// The boxes drawn over the selection and over every find match, kept in one holder
// element so they can all be removed together.
export default function createMarks(st) {
    const selection = st.selection;
    let selectionMark_ = null;
    const clearSelectionMark = () => {
        if (selectionMark_) {
            selectionMark_.forEach((m) => {
                m.remove();
            });
        }
    };
    const markHolder_ = document.createElement("div");
    function createMark(className, node1, offset1, node2, offset2) {
        let rects = getTextRect(node1, offset1, node2, offset2);
        if (rects.length > 100) {
            // avoid hangs due to huge amounts of selection
            return []
        }
        const marks = Array.from(rects).map((r) => {
            if (r.width > 0 && r.height > 0) {
                var mark = st.markTemplate.cloneNode(false);
                mark.className = className;
                mark.style.position = "absolute";
                mark.style.zIndex = 2147483299;
                mark.style.left = document.scrollingElement.scrollLeft + r.left + 'px';
                mark.style.top = document.scrollingElement.scrollTop + r.top + 'px';
                mark.style.width = r.width + 'px';
                mark.style.height = r.height + 'px';
                markHolder_.appendChild(mark);
                return mark;
            }
            return null;
        }).filter((m) => m !== null);
        if (marks.length && !document.documentElement.contains(markHolder_)) {
            document.documentElement.prepend(markHolder_);
        }
        return marks;
    }
    function createSelectionMark(node1, offset1, node2, offset2) {
        return createMark("surfingkeys_selection_mark", node1, offset1, node2, offset2)
    }
    function createMatchMark(node1, offset1, node2, offset2) {
        const marks = createMark("surfingkeys_match_mark", node1, offset1, node2, offset2);

        if (marks.length) {
            st.matches.push([node1, offset1, marks]);
        }
    }
    return {
        clearSelectionMark,
        createMatchMark,
        // Redraw the selection box after the page selection changed.
        markSelection() {
            clearSelectionMark();
            selectionMark_ = createSelectionMark(selection.anchorNode, selection.anchorOffset, selection.focusNode, selection.focusOffset);
        },
        removeHolder() {
            setSanitizedContent(markHolder_, "");
            markHolder_.remove();
        },
    };
}
