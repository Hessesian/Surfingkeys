import { getWordUnderCursor, setSanitizedContent } from '../../common/utils.js';

// The bubble that shows an inline query result next to the selected word.
export default function installBubble(self, { setDisplay }) {
    const _actions = self._actions;
    const _bubble = document.getElementById('sk_bubble');
    const sk_bubble_content = _bubble.querySelector("div.sk_bubble_content");
    const sk_bubble_arrow = _bubble.querySelector('div.sk_arrow');
    const sk_bubbleClassList = sk_bubble_content.classList;
    function clearScrollerIndicator() {
        sk_bubbleClassList.remove("sk_scroller_indicator_top");
        sk_bubbleClassList.remove("sk_scroller_indicator_middle");
        sk_bubbleClassList.remove("sk_scroller_indicator_bottom");
    }
    sk_bubble_content.onscroll = function(evt) {
        clearScrollerIndicator();
        if (this.scrollTop === 0) {
            sk_bubbleClassList.add("sk_scroller_indicator_top");
        } else if (this.scrollTop + this.offsetHeight >= this.scrollHeight) {
            sk_bubbleClassList.add("sk_scroller_indicator_bottom");
        } else {
            sk_bubbleClassList.add("sk_scroller_indicator_middle");
        }
    };
    _actions['showBubble'] = function(message) {
        var pos = message.position;
        pos.left += pos.winX;
        pos.top += pos.winY;
        // set position to (0, 0) to leave enough space for content.
        _bubble.style.top = "0px";
        _bubble.style.left = "0px";
        setSanitizedContent(sk_bubble_content, message.content);
        sk_bubble_content.style.maxWidth = (pos.winWidth - 32) + "px";
        sk_bubble_content.scrollTop = 0;
        clearScrollerIndicator();
        _bubble.style.display = "";
        var w = _bubble.offsetWidth,
            h = _bubble.offsetHeight;
        var left = [pos.left - 11 - w / 2, w / 2];
        if (left[0] < pos.winX) {
            left[1] += left[0] - pos.winX;
            left[0] = pos.winX;
        } else if ((left[0] + w) > pos.winWidth) {
            left[1] += left[0] - pos.winX - pos.winWidth + w;
            left[0] = pos.winX + pos.winWidth - w;
        }
        sk_bubble_arrow.style.left = (left[1] + pos.width / 2 - 2) + "px";
        _bubble.style.left = left[0] + "px";
        _bubble.noPointerEvents = message.noPointerEvents;

        if (pos.top + pos.height / 2 > pos.winHeight / 2) {
            sk_bubble_arrow.setAttribute("dir", "down");
            sk_bubble_arrow.style.top = "100%";
            sk_bubble_content.style.maxHeight = (pos.top - 12 - 32) + "px";
            h = _bubble.offsetHeight;
            _bubble.style.top = (pos.top - h - 12) + "px";
        } else {
            sk_bubble_arrow.setAttribute("dir", "up");
            sk_bubble_arrow.style.top = "-12px";
            sk_bubble_content.style.maxHeight = (pos.winHeight - (pos.top + pos.height + 12) - 32) + "px";
            h = _bubble.offsetHeight;
            _bubble.style.top = pos.top + pos.height + 12 + "px";
        }
        if (sk_bubble_content.scrollHeight > sk_bubble_content.offsetHeight) {
            _bubble.noPointerEvents = false;
            sk_bubbleClassList.add("sk_scroller_indicator_top");
        }
        self.flush();
        if (!_bubble.noPointerEvents) {
            setDisplay(_bubble);
            self.enter(0, true);
        }
    };

    _actions['hideBubble'] = function() {
        _bubble.style.display = "none";
        self.flush();
    };

    function onResize() {
        if (_bubble.style.display !== "none") {
            self.contentCommand({
                action: 'updateInlineQuery'
            });
        }
    }

    // for mouseSelectToQuery
    document.onmouseup = function(e) {
        if (!_bubble.contains(e.target)) {
            _bubble.style.display = "none";
            self.flush();
            self.contentCommand({
                action: 'emptySelection'
            });
            window.removeEventListener("resize", onResize);
        } else {
            var sel = window.getSelection().toString().trim() || getWordUnderCursor(true);
            if (sel && sel.length > 0) {
                self.contentCommand({
                    action: 'updateInlineQuery',
                    word: sel
                }, function() {
                    window.addEventListener("resize", onResize);
                });
            }
        }
    };

    _bubble.querySelector("div.sk_bubble_content").addEventListener("mousewheel", function (evt) {
        if (evt.deltaY > 0 && this.scrollTop + this.offsetHeight >= this.scrollHeight || evt.deltaY < 0 && this.scrollTop <= 0) {
            evt.preventDefault();
        }
    }, { passive: false });
}
