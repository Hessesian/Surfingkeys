import { setSanitizedContent } from '../../common/utils.js';
import { shouldCollapseAlias, shouldExpandAlias } from '../../../core/omnibar';

// "alias<Space>" in the URL omnibar hands the query to that search engine; Backspace on an
// empty query (or right at the expansion point) hands it back to the handler it came from.
export default function installAlias(self, st, searchEngine) {
    self.expandAlias = function(alias, val) {
        var eaten = false;
        if (shouldExpandAlias(alias, searchEngine.aliases, st.handler === searchEngine)) {
            st.lastHandler = st.handler;
            st.handler = searchEngine;
            Object.assign(searchEngine, searchEngine.aliases[alias]);
            setSanitizedContent(self.resultsDiv, "");
            setSanitizedContent(self.promptSpan, st.handler.prompt);
            setSanitizedContent(st.resultPageSpan, "");
            st.items = null;
            self.collapsingPoint = val;
            self.input.value = val;
            if (val.length) {
                self.triggerInput();
            }
            eaten = true;
        }
        return eaten;
    };

    self.collapseAlias = function() {
        var eaten = false, val = self.input.value;
        if (shouldCollapseAlias(!!st.lastHandler, st.handler === st.lastHandler, val, self.collapsingPoint)) {
            st.handler = st.lastHandler;
            st.lastHandler = null;
            setSanitizedContent(self.promptSpan, st.handler.prompt);
            if (val.length) {
                self.input.value = val.substr(0, val.length - 1);
            }
            self.triggerInput();
            eaten = true;
        }
        return eaten;
    };
}
