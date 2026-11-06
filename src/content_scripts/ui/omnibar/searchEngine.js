import { RUNTIME, runtime } from '../../common/runtime.js';
import { regexFromString } from '../../../common/utils.js';
import { constructSearchURL, createElementWithContent } from '../../common/utils.js';
import { separatorHtml } from './constants';

export default function SearchEngine(omnibar, front) {
    var self = {};
    self.aliases = {};

    var _pendingRequest = undefined; // timeout ID
    function clearPendingRequest() {
        if (_pendingRequest) {
            clearTimeout(_pendingRequest);
            _pendingRequest = undefined;
        }
    }
    self.onOpen = function(arg) {
        Object.assign(self, self.aliases[arg]);
        var q = omnibar.input.value;
        if (q.length) {
            var b = q.match(/^(site:\S+\s*).*/);
            if (b) {
                omnibar.input.setSelectionRange(b[1].length, q.length);
            }
            omnibar.triggerInput();
        }
    };
    self.onClose = function() {
        clearPendingRequest();
        self.prompt = undefined;
        self.url = undefined;
        self.suggestionURL = undefined;
    };
    self.onTabKey = function() {
        var fi = omnibar.resultsDiv.querySelector('li.focused');
        if (fi && fi.query) {
            omnibar.input.value = fi.query;
        }
    };
    self.onEnter = function() {
        var fi = omnibar.resultsDiv.querySelector('li.focused'), url;
        if (fi) {
            url = fi.url || constructSearchURL(self.url, encodeURIComponent(fi.query || omnibar.input.value));
        } else {
            url = constructSearchURL(self.url, encodeURIComponent(omnibar.input.value));
        }
        RUNTIME("openLink", {
            tab: {
                tabbed: this.tabbed,
                active: this.activeTab
            },
            url: url
        });
        return this.activeTab;
    };
    function listSuggestions(suggestions) {
        omnibar.detectAndInsertURLItem(omnibar.input.value, suggestions);
        const query = encodeURIComponent(omnibar.input.value);
        var rxp = regexFromString(query, runtime.getCaseSensitive(query), true);
        omnibar.listResults(suggestions, function (w) {
            if (w.hasOwnProperty('html')) {
                return omnibar.createItemFromRawHtml(w);
            } else if (w.hasOwnProperty('url')) {
                return omnibar.createURLItem(w, rxp);
            } else {
                var li = createElementWithContent('li', `⌕ ${w}`);
                li.query = w;
                return li;
            }
        });
    }
    self.onInput = function () {
        var canSuggest = self.suggestionURL;
        var showSuggestions = canSuggest && runtime.conf.omnibarSuggestion;

        if (!showSuggestions) {
            listSuggestions([]);
            return;
        }

        clearPendingRequest();
        // Set a timeout before the request is dispatched so that it can be canceled if necessary.
        // This helps prevent rate-limits when typing a long query.
        // E.g. github.com's API rate-limits after only 10 unauthenticated requests.
        _pendingRequest = setTimeout(function() {
            const requestUrl = constructSearchURL(self.suggestionURL, encodeURIComponent(omnibar.input.value));
            RUNTIME('request', {
                method: 'get',
                url: requestUrl
            }, function (resp) {
                front.contentCommand({
                    action: 'getSearchSuggestions',
                    url: self.suggestionURL,
                    query: omnibar.input.value,
                    requestUrl,
                    response: resp
                }, function(resp) {
                    resp = resp.data;
                    if (!Array.isArray(resp)) {
                        resp = [];
                    }
                    listSuggestions(resp);
                });
            });
        }, runtime.conf.omnibarSuggestionTimeout);
    };

    front._actions['addSearchAlias'] = function (message) {
        self.aliases[message.alias] = {
            prompt: '' + message.prompt + separatorHtml,
            url: message.url,
            suggestionURL: message.suggestionURL
        };
        const searchEngineIconStorageKey = `surfingkeys.searchEngineIcon.${message.prompt}`;
        const searchEngineIcon = localStorage.getItem(searchEngineIconStorageKey);
        if (searchEngineIcon) {
            self.aliases[message.alias].prompt = `<img src="${searchEngineIcon}" alt="${message.prompt}" style="width: 20px;" />`;
        } else if (front.topOrigin.startsWith("http")){
            let iconUrl;
            if (message.options?.favicon_url) {
              iconUrl = new URL(message.options.favicon_url);
            } else {
              iconUrl = new URL(message.url);
              iconUrl.pathname = "favicon.ico";
              iconUrl.search = "";
              iconUrl.hash = "";
            }
            RUNTIME('requestImage', {
                url: iconUrl.href,
            }, function(response) {
                if (response) {
                    localStorage.setItem(searchEngineIconStorageKey, response.text);
                    self.aliases[message.alias].prompt = `<img src="${response.text}" alt="${message.prompt}" style="width: 20px;" />`;
                }
            });
        }
    };
    front._actions['removeSearchAlias'] = function (message) {
        delete self.aliases[message.alias];
    };
    front._actions['getSearchAliases'] = function (message) {
        front.postMessage({
            aliases: self.aliases,
            toContent: true,
            id: message.id
        });
    };

    return self;
}
