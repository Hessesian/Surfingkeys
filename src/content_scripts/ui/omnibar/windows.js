import { RUNTIME, runtime } from '../../common/runtime.js';
import { regexFromString } from '../../../common/utils.js';
import { createElementWithContent } from '../../common/utils.js';
import { separatorHtml } from './constants';

export default function OpenWindows(omnibar, front) {
    const self = {
        prompt: `Move current tab to window${separatorHtml}`
    };

    self.getResults = function () {
        omnibar.cachedPromise = new Promise(function(resolve, reject) {
            RUNTIME('getWindows', {
                query: ''
            }, function(response) {
                resolve(response.windows);
            });
        });
    };
    self.onEnter = function() {
        const fi = omnibar.resultsDiv.querySelector('li.focused');
        let windowId = -1;
        if (fi && fi.windowId !== undefined) {
            windowId = fi.windowId;
        }
        RUNTIME('moveToWindow', { windowId });
        return true;
    };
    self.onOpen = function() {
        omnibar.input.placeholder = "Press enter without focusing an item to move to a new window.";
        self.getResults();
        self.onInput();
    };
    self.onInput = function() {
        omnibar.cachedPromise.then(function(cached) {
            if (cached.length === 0) {
                RUNTIME('moveToWindow', { windowId: -1 });
                front.hidePopup();
            }
            let filtered = cached;
            const query = omnibar.input.value;
            let rxp = null;
            if (query && query.length) {
                rxp = regexFromString(query, runtime.getCaseSensitive(query), false);
                filtered = cached.filter(function(w) {
                    for (const t of w.tabs) {
                        if (rxp.test(t.title) || rxp.test(t.url)) {
                            return true;
                        }
                    }
                    return false;
                });
            }
            rxp = regexFromString(query, runtime.getCaseSensitive(query), true);
            omnibar.listResults(filtered, function(w) {
                const li = createElementWithContent('li');
                li.windowId = parseInt(w.id);
                li.classList.add('window');
                if (w.isPreviousChoice) {
                    li.classList.add('focused');
                }
                w.tabs.forEach(t => {
                    const div = createElementWithContent('div', '', {class: "tab_in_window"});
                    div.appendChild(createElementWithContent('div', omnibar.highlight(rxp, t.title), {class: "title"}));
                    div.appendChild(createElementWithContent('div', omnibar.highlight(rxp, new URL(t.url).origin), {class: "url"}));
                    li.appendChild(div);
                });
                // set url so that we can copy all URls of tabs in this window.
                li.url = w.tabs.map(t => {
                    return t.url;
                }).join("\n");
                return li;
            });
        });
    };
    return self;
}
