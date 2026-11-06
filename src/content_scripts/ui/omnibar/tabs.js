import { RUNTIME, runtime } from '../../common/runtime.js';
import { filterByTitleOrUrl } from '../../../common/utils.js';
import { separatorHtml } from './constants';

export function OpenTabs(omnibar) {
    var self = {
        focusFirstCandidate: true,
    };

    var getTabsArgs = {};
    self.getResults = function () {
        omnibar.cachedPromise = new Promise(function(resolve, reject) {
            getTabsArgs.tabsThreshold = Math.min(runtime.conf.tabsThreshold, Math.ceil(window.innerWidth / 26));
            RUNTIME('getTabs', getTabsArgs, function(response) {
                resolve(response.tabs);
            });
        });
    };
    self.onOpen = function(args) {
        if (args && args.action === "gather") {
            self.prompt = `Gather filtered tabs into current window${separatorHtml}`;
            self.onEnter = function() {
                RUNTIME('gatherTabs', {
                    tabs: omnibar.getItems()
                });
                return true;
            };
            getTabsArgs = {queryInfo: {currentWindow: false}};
        } else {
            self.prompt = `tabs${separatorHtml}`;
            self.onEnter = omnibar.openFocused.bind(self);
            getTabsArgs = {};
            if (args && typeof(args.filter) === 'string') {
                getTabsArgs.filter = args.filter;
            }
        }
        self.getResults();
        self.onInput();
    };
    self.onInput = function() {
        omnibar.cachedPromise.then(function(cached) {
            var filtered = filterByTitleOrUrl(cached, omnibar.input.value, runtime.getCaseSensitive(omnibar.input.value));
            omnibar.listURLs(filtered, false);
        });
    };
    return self;
}

export function CloseTabs(omnibar) {
    var self = {
        focusFirstCandidate: true,
    };

    self.onOpen = function() {
        self.prompt = `close tabs${separatorHtml}`;
        omnibar.cachedPromise = new Promise(function(resolve) {
            RUNTIME('getTabs', {queryInfo: {currentWindow: true}}, function(response) {
                resolve(response.tabs);
            });
        });
        self.onInput();
    };
    self.onInput = function() {
        omnibar.cachedPromise.then(function(cached) {
            var filtered = filterByTitleOrUrl(cached, omnibar.input.value, runtime.getCaseSensitive(omnibar.input.value));
            filtered.forEach(function(tab) {
                try {
                    var u = new URL(tab.url);
                    tab.url = u.origin + u.pathname;
                } catch (e) {}
            });
            omnibar.listURLs(filtered, false);
        });
    };
    self.onEnter = function() {
        var items = omnibar.resultsDiv.querySelectorAll('#sk_omnibarSearchResult>ul>li');
        var tabIds = [];
        items.forEach(function(li) {
            if (li.uid && li.uid[0] === 'T') {
                var parts = li.uid.substr(1).split(":");
                tabIds.push(parseInt(parts[1]));
            }
        });
        if (tabIds.length > 0) {
            RUNTIME('closeTabByIds', {tabIds: tabIds});
        }
        return true;
    };
    return self;
}
