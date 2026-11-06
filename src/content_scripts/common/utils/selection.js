import { scrollIntoViewIfNeeded } from './visibility.js';

function actionWithSelectionPreserved(cb) {
    var selection = document.getSelection();
    var pos = [selection.type, selection.anchorNode, selection.anchorOffset, selection.focusNode, selection.focusOffset];

    var dt = document.scrollingElement.scrollTop;

    cb(selection);

    document.scrollingElement.scrollTop = dt;

    if (pos[0] === "None") {
        selection.empty();
    } else if (pos[0] === "Caret") {
        selection.setPosition(pos[3], pos[4]);
    } else if (pos[0] === "Range") {
        selection.setPosition(pos[1], pos[2]);
        selection.extend(pos[3], pos[4]);
    }
}

function getTextNodes(root, pattern, flag) {
    var skip_tags = ['script', 'style', 'noscript', 'surfingkeys_mark'];
    var treeWalker = document.createTreeWalker(
        root,
        NodeFilter.SHOW_TEXT, {
            acceptNode: function(node) {
                if (!node.data.trim() || !node.parentNode.offsetParent || skip_tags.indexOf(node.parentNode.localName.toLowerCase()) !== -1 || !pattern.test(node.data)) {
                    // node changed, reset pattern.lastIndex
                    pattern.lastIndex = 0;
                    return NodeFilter.FILTER_REJECT;
                }
                var br = node.parentNode.getBoundingClientRect();
                if (br.width < 4 || br.height < 4) {
                    return NodeFilter.FILTER_REJECT;
                }
                return NodeFilter.FILTER_ACCEPT;
            }
        }, false);

    var nodes = [];
    if (flag === 1) {
        nodes.push(treeWalker.firstChild());
    } else if (flag === -1) {
        nodes.push(treeWalker.lastChild());
    } else if (flag === 0) {
        return treeWalker;
    } else if (flag === 2) {
        while (treeWalker.nextNode()) nodes.push(treeWalker.currentNode.parentNode);
    } else {
        while (treeWalker.nextNode()) nodes.push(treeWalker.currentNode);
    }
    return nodes;
}

function getTextNodePos(node, offset, length) {
    var selection = document.getSelection();
    selection.setBaseAndExtent(node, offset, node, length ? (offset + length) : node.data.length);
    var br = selection.rangeCount > 0 ? selection.getRangeAt(0).getClientRects()[0] : null;
    var pos = {
        left: -1,
        top: -1
    };
    if (br && br.height > 0 && br.width > 0) {
        pos.left = br.left;
        pos.top = br.top;
        pos.width = br.width;
        pos.height = br.height;
    }
    return pos;
}

var _focusedRange = document.createRange();
function getTextRect() {
    let rects = [];
    try {
        let start = arguments[1];
        while (rects.length === 0 && start >= 0) {
            _focusedRange.setStart(arguments[0], start);
            if (arguments.length > 3) {
                _focusedRange.setEnd(arguments[2], arguments[3]);
            } else if (arguments.length > 2) {
                _focusedRange.setEnd(arguments[0], arguments[2]);
            } else {
                _focusedRange.setEnd(arguments[0], arguments[1]);
            }
            rects = _focusedRange.getClientRects();
            start --;
        }
    } catch (e) {
        return [];
    }
    return rects;
}

function locateFocusNode(selection) {
    let se = selection.focusNode.parentElement
    scrollIntoViewIfNeeded(se, true);
    var r = getTextRect(selection.focusNode, selection.focusOffset)[0];
    if (!r) {
        r = selection.focusNode.getBoundingClientRect();
    }
    if (r) {
        r = {
            left: r.left,
            top: r.top,
            width: r.width,
            height: r.height
        };
        if (r.left < 0 || r.left >= window.innerWidth) {
            se.scrollLeft += r.left - window.innerWidth / 2;
            r.left = window.innerWidth / 2;
        }
        if (r.top < 0 || r.top >= window.innerHeight) {
            se.scrollTop += r.top - window.innerHeight / 2;
            r.top = window.innerHeight / 2;
        }
        return r;
    }
    return null;
}

function getNearestWord(text, offset) {
    var ret = [0, text.length];
    var nonWord = /\W/;
    if (offset < 0) {
        offset = 0;
    } else if (offset >= text.length) {
        offset = text.length - 1;
    }
    var found = true;
    if (nonWord.test(text[offset])) {
        var delta = 0;
        found = false;
        while (!found && (offset > delta || (offset + delta) < text.length)) {
            delta++;
            found = ((offset - delta) >= 0 && !nonWord.test(text[offset - delta])) || ((offset + delta) < text.length && !nonWord.test(text[offset + delta]));
        }
        offset = ((offset - delta) >= 0 && !nonWord.test(text[offset - delta])) ? (offset - delta) : (offset + delta);
    }
    if (found) {
        var start = offset,
            end = offset;
        while (start >= 0 && !nonWord.test(text[start])) {
            start--;
        }
        while (end < text.length && !nonWord.test(text[end])) {
            end++;
        }
        ret = [start + 1, end - start - 1];
    }
    return ret;
}

var _clickPos = null;
document.addEventListener('mousedown', event => {
    _clickPos = [event.clientX, event.clientY];
});

function getWordUnderCursor(mouseCursor) {
    var selection = document.getSelection();
    if (selection.focusNode && selection.focusNode.textContent) {
        var range = getNearestWord(selection.focusNode.textContent, selection.focusOffset);
        var selRect = getTextRect(selection.focusNode, range[0], range[0] + range[1])[0];
        var word = selection.focusNode.textContent.substr(range[0], range[1]);
        if (selRect && word) {
            if (!mouseCursor || _clickPos && selRect.has(_clickPos[0], _clickPos[1], 0, 0)) {
                return word.trim();
            }
        }
    }
    return null;
}

DOMRect.prototype.has = function (x, y, ex, ey) {
    // allow some errors of x and y as ex and ey respectively.
    return (y > this.top - ey && y < this.bottom + ey
        && x > this.left - ex && x < this.right + ex);
};

export {
    actionWithSelectionPreserved,
    getTextNodes,
    getTextNodePos,
    getTextRect,
    locateFocusNode,
    getWordUnderCursor,
};
