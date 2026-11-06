import { regexFromString } from '../../../common/utils.js';
import {
    attachFaviconToImgSrc,
    createElementWithContent,
    getBrowserName,
    htmlEncode,
    safeDecodeURI,
    safeDecodeURIComponent,
    scrollIntoViewIfNeeded,
    setSanitizedContent,
    timeStampString,
} from '../../common/utils.js';
import { RUNTIME, runtime } from '../../common/runtime.js';
import { highlightMatches, pageRange, urlItemFromInput, urlItemMeta } from '../../../core/omnibar';
import { getPosition } from './state';

// Everything that turns a list of results into <li>s: URL items, pages, the focus.
// Returns the page renderer, which the paging keys call too.
export default function installResults(self, st) {
    const position = () => getPosition(st, runtime);

    self.highlight = highlightMatches;

    self.createURLItem = function(b, rxp) {
        b.title = (b.title && b.title !== "") ? b.title : safeDecodeURI(b.url);
        const meta = urlItemMeta(b);
        let additional = "";
        if (meta.kind === "history") {
            additional = `<span class=omnibar_timestamp># ${timeStampString(b.lastVisitTime)}</span>`;
            additional += `<span class=omnibar_visitcount> (${b.visitCount})</span>`;
        } else if (meta.kind === "bookmark") {
            additional = `<span class=omnibar_folder>@ ${st.bookmarkFolders[b.parentId].title || ""}</span> <span class=omnibar_timestamp># ${timeStampString(b.dateAdded)}</span>`;
        }
        var li = createElementWithContent('li', `<div class="icon">${meta.type}</div>`);
        if (b.hasOwnProperty('favIconUrl')) {
            li = createElementWithContent('li', `<img class="icon"/>`);
            attachFaviconToImgSrc(b, li.querySelector('img'));
        }
        li.appendChild(createElementWithContent('div',
            `<div class="title">${self.highlight(rxp, htmlEncode(b.title))} ${additional}</div><div class="url">${self.highlight(rxp, htmlEncode(safeDecodeURIComponent(b.url)))}</div>`, { "class": "text-container" }));
        li.uid = meta.uid;
        li.url = b.url;
        li.copy = b.copy;
        li._item = b;
        return li;
    };

    self.createItemFromRawHtml = function({ html, props }) {
        const li = createElementWithContent('li', html);
        if (typeof props === "object") {
            Object.assign(li, props);
        }
        return li;
    };

    self.detectAndInsertURLItem = function(str, toList) {
        const item = urlItemFromInput(str);
        if (item) {
            toList.unshift(item);
        }
    };

    self.getPageSize = () => {
        return runtime.conf.omnibarMaxResults;
    };

    self.getHistoryCacheSize = () => {
        return runtime.conf.omnibarHistoryCacheSize;
    };

    self.listURLs = function(items, showFolder) {
        st.start = 1;
        st.items = items;
        st.showFolder = showFolder;
        listResultPage();
        if (st.savedFocused !== -1) {
            const items = self.resultsDiv.querySelectorAll('#sk_omnibarSearchResult>ul>li');
            self.focusItem(items[st.savedFocused]);
            st.savedFocused = -1;
        }

    };
    self.getItems = function() {
        return st.items;
    };

    function listResultPage() {
        const { si, ei, label } = pageRange(st.start, runtime.conf.omnibarMaxResults, st.items.length, runtime.conf.omnibarHistoryCacheSize);
        setSanitizedContent(st.resultPageSpan, label);
        st.page = st.items.slice(si, ei);
        var query = self.input.value.trim();
        var rxp = null;
        if (query.length) {
            rxp = regexFromString(query, runtime.getCaseSensitive(query), true);
        }
        self.listResults(st.page, function(b) {
            var li;
            if (b.hasOwnProperty('html')) {
                li = self.createItemFromRawHtml(b);
            } else if (b.hasOwnProperty('url') && b.url !== undefined) {
                if (getBrowserName() === "Firefox" && /^(place|data):/i.test(b.url)) {
                    return null;
                }
                li = self.createURLItem(b, rxp);
            } else if (st.showFolder) {
                li = createElementWithContent('li', `<div class="title">▷ ${self.highlight(rxp, b.title)}</div>`);
                li.folder_name = b.title;
                li.folderId = b.id;
            }
            return li;
        });
    }

    self.listResults = function (items, renderItem) {
        setSanitizedContent(self.resultsDiv, "");
        if (!items || items.length === 0) {
            return;
        }
        if (position() === "bottom") {
            items.reverse();
        }
        var ul = document.createElement("ul");
        items.forEach(function(b) {
            var li = renderItem(b);
            if (li) {
                ul.append(li);
                li.onclick = () => {
                    if (li.url) {
                        RUNTIME("openLink", {
                            tab: {
                                tabbed: true,
                                active: true,
                            },
                            url: li.url
                        });
                    } else {
                        self.input.value = li.query;
                        self.input.focus();
                    }
                };
            }
        });
        self.resultsDiv.append(ul);
        items = self.resultsDiv.querySelectorAll("#sk_omnibarSearchResult>ul>li");
        if (runtime.conf.focusFirstCandidate || st.handler.focusFirstCandidate) {
            var fi = (position() === "bottom") ? items.length - 1 : 0;
            items[fi].classList.add('focused');
        }
        if (position() === "bottom" && items.length > 0) {
            scrollIntoViewIfNeeded(items[items.length-1]);
        }
    };

    self.listWords = function(words) {
        self.listResults(words, function(w) {
            var li = createElementWithContent('li', `⌕ ${w}`);
            li.query = w;
            return li;
        });
    };

    self.html = function(content) {
        setSanitizedContent(self.resultsDiv, content);
    };

    self.focusItem = function(fi) {
        if (typeof(fi) === 'string') {
            fi = self.resultsDiv.querySelector(fi);
        }
        if (fi) {
            fi.classList.add('focused');
            const fiRect = fi.getBoundingClientRect();
            const resultsRect = self.resultsDiv.getBoundingClientRect();
            if (fiRect.top < resultsRect.top || fiRect.bottom > resultsRect.bottom) {
              const alignToTop = fiRect.top < resultsRect.top;
              fi.scrollIntoView(alignToTop);
            }
        }
    };

    return { listResultPage };
}
