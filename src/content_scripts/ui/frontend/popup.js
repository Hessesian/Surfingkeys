import { setSanitizedContent } from '../../common/utils.js';

// The generic popup and the Ok/Cancel dialog (the repeat-confirm dialog is one).
export default function installPopup(self, { hints, showElement }) {
    const _actions = self._actions;
    const _popup = document.getElementById('sk_popup');

    function showPopup(content) {
        setSanitizedContent(_popup, content);
        showElement(_popup);
    }

    _actions['showPopup'] = function(message) {
        showPopup(message.content);
    };

    _actions['showDialog'] = function(message) {
        showElement(_popup, () => {
            const hintLabels = hints.genLabels(2);
            setSanitizedContent(_popup, `<div>${message.question}</div><div><div class=sk_tab_hint>${hintLabels[0]}</div><span class=sk_tab_group_title>Ok</span><div class=sk_tab_hint>${hintLabels[1]}</div><span class=sk_tab_group_title>Cancel</span></div>`);
            const tabHints = _popup.querySelectorAll("div.sk_tab_hint");
            _popup.style.textAlign = "center";
            tabHints[0].link = "Ok";
            tabHints[0].label = hintLabels[0];
            tabHints[1].link = "Cancel";
            tabHints[1].label = hintLabels[1];
        }, (matched) => {
            self.contentCommand({
                action: 'dialogResponse',
                result: matched
            });
        });
    };

    return showPopup;
}
