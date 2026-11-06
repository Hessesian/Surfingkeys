import KeyboardUtils from '../../common/keyboardUtils';
import Mode from '../../common/mode';
import { RUNTIME } from '../../common/runtime.js';
import { getBrowserName, rotateInput } from '../../common/utils.js';

export default function createFind(front, StatusBar) {
    var self = new Mode("Find", "/");

    self.addEventListener('keydown', function(event) {
        // prevent this event to be handled by Surfingkeys' other listeners
        event.sk_suppressed = true;
    }).addEventListener('mousedown', function(event) {
        if (event.target !== input) {
            // user clicks on somewhere else
            reset();
        }
        event.sk_suppressed = true;
    });

    let input;
    let historyInc = 0;
    let userInput = "";
    function reset() {
        input = null;
        StatusBar.show(["", ""]);
        self.exit();
    }

    /**
     * Opens the status bar
     *
     * @memberof StatusBar
     * @instance
     *
     * @return {undefined}
     */
    self.open = function() {
        StatusBar.show(["/", '<input id="sk_find" class="sk_theme"/>']);
        input = front.statusBar.querySelector("input");
        if (!getBrowserName().startsWith("Safari")) {
            input.oninput = function() {
                if (input.value.length && input.value !== ".") {
                    front.visualCommand({
                        action: 'visualUpdate',
                        query: input.value
                    });
                    // To find in usage popup will set focus and selection elsewhere
                    // we need bring it back
                    input.focus();
                    input.setSelectionRange(input.value.length, input.value.length);
                }
            };
        }
        var findHistory = [];
        RUNTIME('getSettings', {
            key: 'findHistory'
        }, function(response) {
            userInput = "";
            findHistory = response.settings.findHistory;
            historyInc = findHistory.length;
        });
        input.onkeydown = function(event) {
            if (Mode.isSpecialKeyOf("<Esc>", event.sk_keyName)) {
                reset();
                front.visualCommand({
                    action: 'visualClear'
                });
            } else if (event.keyCode === KeyboardUtils.keyCodes.enter) {
                var query = input.value;
                if (query.length && query !== ".") {
                    if (event.ctrlKey) {
                        query = '\\b' + query + '\\b';
                    }
                    reset();
                    RUNTIME('updateInputHistory', { find: query });
                    front.visualCommand({
                        action: 'visualEnter',
                        query: query
                    });
                }
            } else if (event.keyCode === KeyboardUtils.keyCodes.upArrow || event.keyCode === KeyboardUtils.keyCodes.downArrow) {
                if (findHistory.length) {
                    [input.value, historyInc] = rotateInput(findHistory, (event.keyCode === KeyboardUtils.keyCodes.downArrow), historyInc, userInput);
                    front.visualCommand({
                        action: 'visualUpdate',
                        query: query
                    });
                    event.preventDefault();
                }
            } else {
                userInput = input.value;
                historyInc = findHistory.length;
            }
        };
        input.focus();
        front.startInputGuard();
        self.enter();
    };
    return self;
}
