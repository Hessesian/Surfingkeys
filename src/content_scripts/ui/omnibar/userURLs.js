import { runtime } from '../../common/runtime.js';
import { filterByTitleOrUrl } from '../../../common/utils.js';
import { separatorHtml } from './constants';

export default function OpenUserURLs(omnibar, front) {
    var self = {
        focusFirstCandidate: true,
        prompt: `UserURLs${separatorHtml}`
    };

    var _items;
    self.onOpen = function(args) {
        _items = args;
        self.onInput();
    };

    self.onInput = function() {
        var query = omnibar.input.value;
        var urls = [];

        urls = filterByTitleOrUrl(_items, query, runtime.getCaseSensitive(query));
        omnibar.listURLs(urls, false);
    };
    self.onEnter = function() {
        var fi = omnibar.resultsDiv.querySelector('li.focused');
        front.contentCommand({
            action: 'userURLs_entered',
            item: fi ? fi._item : { url: omnibar.input.value },
            tabbed: this.tabbed,
            ctrlKey: !this.activeTab,
            shiftKey: omnibar.tabbed ^ this.tabbed,
        });
        return this.activeTab;
    };
    return self;
}
