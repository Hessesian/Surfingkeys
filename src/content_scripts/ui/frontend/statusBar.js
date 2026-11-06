import { setSanitizedContent } from '../../common/utils.js';

/**
 * The status bar displays the status of Surfingkeys current mode: Normal, visual, etc.
 *
 * @kind function
 *
 * @param {Object} ui
 * @return {StatusBar} StatusBar instance
 */
export default function createStatusBar(front) {
    var self = {};
    var timerHide = null;
    var ui = front.statusBar;

    // 4 spans
    // mode: 0
    // search: 1
    // searchResult: 2
    // proxy: 3
    self.show = function(contents, duration) {
        if (timerHide) {
            clearTimeout(timerHide);
            timerHide = null;
        }
        var span = ui.querySelectorAll('span');
        for (var i = 0; i < contents.length; i++) {
            if (contents[i] !== undefined) {
                setSanitizedContent(span[i], contents[i]);
            }
        }
        var lastSpan = -1;
        for (var i = 0; i < span.length; i++) {
            if (span[i].innerHTML.length) {
                lastSpan = i;
                span[i].style.padding = "0px 8px";
                span[i].style.borderRight = "1px solid #999";
            } else {
                span[i].style.padding = "";
                span[i].style.borderRight = "";
            }
        }
        if (lastSpan === -1) {
            ui.style.display = 'none';
        } else {
            span[lastSpan].style.borderRight = "";
            ui.style.display = 'block';
        }
        front.flush();
        if (duration) {
            timerHide = setTimeout(function() {
                self.show(["", "", "", ""]);
            }, duration);
        }
    };
    return self;
}
