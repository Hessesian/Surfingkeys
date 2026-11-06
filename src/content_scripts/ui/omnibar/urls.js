import { debounce } from 'lodash';
import { RUNTIME, runtime } from '../../common/runtime.js';
import { filterByTitleOrUrl } from '../../../common/utils.js';
import { separatorHtml } from './constants';

export function OpenURLs(prompt, omnibar, queryFn) {
    var self = { prompt }, sequenceNumber;

    const queryAndList = () => {
        let myseq = ++sequenceNumber;
        queryFn().then((urls) => {
            if (myseq === sequenceNumber) {
                var val = omnibar.input.value;
                omnibar.detectAndInsertURLItem(val, urls);
                omnibar.listURLs(urls, false);
            }
        });
    };
    self.onOpen = function(arg) {
        if (arg) {
            omnibar.input.value = arg;
        }
        sequenceNumber = 0;
        queryAndList();
    };
    self.onInput = debounce(queryAndList, 200);
    self.onClose = function() {
        self.onInput.cancel();
    };

    self.onReset = function() {
        runtime.conf.historyMUOrder = !runtime.conf.historyMUOrder;
        queryFn().then((historyItems) => {
            if (runtime.conf.historyMUOrder) {
                historyItems = historyItems.sort(function(a, b) {
                    return b.visitCount - a.visitCount;
                });
            } else {
                historyItems = historyItems.sort(function(a, b) {
                    return b.lastVisitTime - a.lastVisitTime;
                });
            }
            omnibar.listURLs(historyItems, false);
        });
    };
    return self;
}

// The URL-list handlers differ only in their prompt and in where the list comes from.
export function HistoryURLs(omnibar) {
    return OpenURLs(`history${separatorHtml}`, omnibar, () => {
        return new Promise((resolve, reject) => {
            RUNTIME('getHistory', {
                maxResults: omnibar.getHistoryCacheSize(),
                query: omnibar.input.value,
                sortByMostUsed: runtime.conf.historyMUOrder
            }, function(response) {
                resolve(response.history);
            });
        });
    });
}

export function AllURLs(omnibar) {
    return OpenURLs(separatorHtml, omnibar, () => {
        return new Promise((resolve, reject) => {
            RUNTIME('getTabs', {
                queryInfo: runtime.conf.omnibarTabsQuery
            }, function(response) {
                var results = response.tabs;
                RUNTIME("getTopSites", null, function(response) {
                    results = results.concat(response.urls);
                    results = filterByTitleOrUrl(results, omnibar.input.value, runtime.getCaseSensitive(omnibar.input.value));
                    omnibar.listBookmarkFolders(function() {
                        RUNTIME('getAllURLs', {
                            maxResults: omnibar.getHistoryCacheSize() - results.length,
                            query: omnibar.input.value
                        } , function(response) {
                            results = results.concat(response.urls);
                            resolve(results);
                        });
                    });
                });
            });
        });
    });
}

export function RecentlyClosedURLs(omnibar) {
    return OpenURLs(`Recently closed${separatorHtml}`, omnibar, () => {
        return new Promise((resolve, reject) => {
            RUNTIME('getRecentlyClosed', null, function(response) {
                resolve(filterByTitleOrUrl(response.urls, omnibar.input.value, runtime.getCaseSensitive(omnibar.input.value)));
            });
        });
    });
}

export function TabHistoryURLs(omnibar) {
    return OpenURLs(`Tab History${separatorHtml}`, omnibar, () => {
        return new Promise((resolve, reject) => {
            RUNTIME('getTabURLs', null, function(response) {
                resolve(filterByTitleOrUrl(response.urls, omnibar.input.value, runtime.getCaseSensitive(omnibar.input.value)));
            });
        });
    });
}
