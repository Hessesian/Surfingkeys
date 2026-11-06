import KeyboardUtils from '../../common/keyboardUtils';
import { runtime } from '../../common/runtime.js';
import { htmlEncode, initL10n, setSanitizedContent } from '../../common/utils.js';
import { localizeAnnotation } from './usage.js';

// The keys typed so far, and the candidates for the next one after a pause.
export default function installKeystroke(self) {
    const _actions = self._actions;
    const keystroke = document.getElementById('sk_keystroke');

    var _pendingHint;
    function clearPendingHint() {
        if (_pendingHint) {
            clearTimeout(_pendingHint);
            _pendingHint = undefined;
        }
    }

    _actions['hideKeystroke'] = function() {
        if (keystroke.style.display !== "none") {
            keystroke.classList.remove("expandRichHints");
            setSanitizedContent(keystroke, "");
            keystroke.style.display = "none";
            self.flush();
        }
        if (runtime.conf.richHintsForKeystroke > 0 && runtime.conf.richHintsForKeystroke < 10000) {
            clearPendingHint();
        }
    };

    function showRichHints(keyHints) {
        initL10n(function (locale) {
            var words = keyHints.accumulated;
            var cc = keyHints.candidates;
            words = Object.keys(cc).sort().map(function (w) {
                const annotation = localizeAnnotation(locale, cc[w].annotation);
                if (annotation) {
                    const nextKey = w.substr(keyHints.accumulated.length);
                    return `<div><span class=kbd-span><kbd>${htmlEncode(KeyboardUtils.decodeKeystroke(keyHints.accumulated))}<span class=candidates>${htmlEncode(KeyboardUtils.decodeKeystroke(nextKey))}</span></kbd></span><span class=annotation>${annotation}</span></div>`;
                } else {
                    return "";
                }
            }).join("");
            if (words.length > 0 && _pendingHint) {
                setSanitizedContent(keystroke, words);
                keystroke.classList.add("expandRichHints");
                self.flush();
            }
        });
    }
    _actions['showKeystroke'] = function (message) {
        if (keystroke.style.display !== "none" && keystroke.classList.contains("expandRichHints")) {
            showRichHints(message.keyHints);
        } else {
            clearPendingHint();
            keystroke.style.display = "";
            self.flush();
            var keys = keystroke.innerHTML + htmlEncode(KeyboardUtils.decodeKeystroke(message.keyHints.key));
            setSanitizedContent(keystroke, keys);

            if (runtime.conf.richHintsForKeystroke > 0 && runtime.conf.richHintsForKeystroke < 10000) {
                _pendingHint = setTimeout(function() {
                    showRichHints(message.keyHints);
                }, runtime.conf.richHintsForKeystroke);
            }
        }
    };
}
