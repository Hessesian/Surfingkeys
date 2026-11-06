import {
    getCssSelectorsOfEditable,
    getVisibleElementsBySelector,
} from '../utils.js';
import placeHintsHost from './host.js';

// Hints.createInputLayer: focus the only editable on the page, or mask each of them and
// let Tab pick one (the keys are handled in keys.js).
export default function installInputLayer(self, st, renderer, { insert, normal, hintsHost }) {
    self.createInputLayer = function() {
        placeHintsHost(hintsHost);
        const cssSelector = getCssSelectorsOfEditable();

        var elements = getVisibleElementsBySelector(cssSelector, function(e) {
            return !e.disabled && !e.readOnly
                && (e.type === "text" || e.type === "email" || e.type === "search" || e.type === "password");
        });

        if (elements.length === 0 && document.querySelector(cssSelector) !== null) {
            document.querySelector(cssSelector).scrollIntoView();
            elements = getVisibleElementsBySelector(cssSelector, function(e) {
                return !e.disabled && !e.readOnly;
            });
        }

        if (elements.length > 1) {
            self.enter();
            const ai = renderer.placeInputMasks(elements, st.lastCreateAttrs);
            normal.passFocus(true);
            ai.link.focus();
        } else if (elements.length === 1) {
            normal.passFocus(true);
            elements[0].focus();
            insert.enter(elements[0]);
        }
    };
}
