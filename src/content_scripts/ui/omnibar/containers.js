import { RUNTIME } from '../../common/runtime.js';
import { createElementWithContent, htmlEncode } from '../../common/utils.js';
import { separatorHtml } from './constants';

export default function OpenContainers(omnibar, front) {
    var self = {
        focusFirstCandidate: true,
        prompt: `container${separatorHtml}`
    };
    self.onOpen = function() {
        RUNTIME('getContainers', null, function(response) {
            omnibar.cachedPromise = Promise.resolve(response.containers);
            self.onInput();
        });
    };
    self.onInput = function() {
        omnibar.cachedPromise.then(function(cached) {
            var query = omnibar.input.value.toLowerCase();
            var filtered = cached.filter(function(c) {
                return c.name.toLowerCase().indexOf(query) !== -1;
            });
            omnibar.listResults(filtered, function(c) {
                var li = createElementWithContent('li', htmlEncode(c.name));
                li.container = c;
                return li;
            });
        });
    };
    self.onEnter = function() {
        var fi = omnibar.resultsDiv.querySelector('li.focused');
        if (fi) {
            var container = fi.container;
            front.contentCommand({
                action: 'containerSelected',
                cookieStoreId: container.cookieStoreId,
                containerName: container.name
            });
        }
        return true;
    };
    return self;
}
