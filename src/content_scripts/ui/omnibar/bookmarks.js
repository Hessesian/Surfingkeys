import KeyboardUtils from '../../common/keyboardUtils';
import { RUNTIME, runtime } from '../../common/runtime.js';
import { setSanitizedContent } from '../../common/utils.js';
import { onlyFolders } from '../../../core/omnibar';
import { separator, separatorHtml } from './constants';

export default function OpenBookmarks(omnibar) {
    var self = {
        prompt: `bookmark${separatorHtml}`,
        inFolder: []
    };

    var folderOnly = false,
        currentFolderId,
        lastFocused = 0;

    function onFolderUp() {
        var fl = self.inFolder.pop();
        if (fl.folderId) {
            currentFolderId = fl.folderId;
            RUNTIME('getBookmarks', {
                parentId: currentFolderId
            }, self.onResponse);
        } else {
            currentFolderId = undefined;
            RUNTIME('getBookmarks', null, self.onResponse);
        }
        self.prompt = fl.prompt;
        setSanitizedContent(omnibar.promptSpan, self.prompt);
        lastFocused = fl.focused;
    }

    self.onEnter = function() {
        var items = Array.from(omnibar.resultsDiv.querySelectorAll("#sk_omnibarSearchResult>ul>li"));
        var ret = false,
            fi = omnibar.resultsDiv.querySelector('li.focused');
        var folderId = fi.folderId;
        if (folderId && !this.activeTab){
            RUNTIME('getBookmarks', {
                parentId: folderId
            }, function(response){
                var subItems = response.bookmarks;
                for ( var m of subItems){
                    if (m.url){
                        RUNTIME("openLink",	{
                            tab: {
                                tabbed: true,
                                active: false
                            },
                            url: m.url
                        });
                    }
                }
            });
            self.inFolder.push({
                prompt: self.prompt,
                folderId: currentFolderId,
                focused: items.indexOf(fi)
            });
            localStorage.setItem("surfingkeys.lastOpenBookmark", JSON.stringify(self.inFolder));
        } else if (folderId) {
            self.inFolder.push({
                prompt: self.prompt,
                folderId: currentFolderId,
                focused: items.indexOf(fi)
            });
            self.prompt = fi.folder_name + separator;
            setSanitizedContent(omnibar.promptSpan, self.prompt);
            omnibar.input.value = "";
            currentFolderId = folderId;
            lastFocused = 0;
            RUNTIME('getBookmarks', {
                parentId: currentFolderId
            }, self.onResponse);
        } else {
            ret = omnibar.openFocused.call(self);
            if (ret) {
                self.inFolder.push({
                    prompt: self.prompt,
                    folderId: currentFolderId,
                    focused: items.indexOf(fi)
                });
                localStorage.setItem("surfingkeys.lastOpenBookmark", JSON.stringify(self.inFolder));
            }
        }
        return ret;
    };

    self.onOpen = function() {
        omnibar.listBookmarkFolders(function() {
            var lastBookmarkFolder = localStorage.getItem("surfingkeys.lastOpenBookmark");
            if (lastBookmarkFolder) {
                self.inFolder = JSON.parse(lastBookmarkFolder);
                onFolderUp();
            } else {
                RUNTIME('getBookmarks', null, self.onResponse);
            }
            if (omnibar.input.value !== "") {
                self.onInput();
            }
        });
    };

    self.onClose = function() {
        self.inFolder = [];
        self.prompt = `bookmark${separatorHtml}`;
        currentFolderId = undefined;
    };

    self.onKeydown = function(event) {
        var eaten = false;
        if (event.keyCode === KeyboardUtils.keyCodes.comma) {
            folderOnly = !folderOnly;
            self.prompt = folderOnly ? `bookmark folder${separator}` : `bookmark${separator}`;
            setSanitizedContent(omnibar.promptSpan, self.prompt);
            RUNTIME('getBookmarks', {
                parentId: currentFolderId,
                query: omnibar.input.value
            }, self.onResponse);
            eaten = true;
        } else if (event.keyCode === KeyboardUtils.keyCodes.backspace && self.inFolder.length && !omnibar.input.value.length) {
            onFolderUp();
            eaten = true;
        } else if (event.ctrlKey && event.shiftKey && KeyboardUtils.isWordChar(event)) {
            var fi = omnibar.resultsDiv.querySelector('li.focused');
            if (fi) {
                var mark_char = String.fromCharCode(event.keyCode);
                Normal.addVIMark(mark_char, fi.url);
                eaten = true;
            }
        }
        return eaten;
    };
    self.onInput = function() {
        var query = omnibar.input.value;
        RUNTIME('getBookmarks', {
            parentId: currentFolderId,
            caseSensitive: runtime.getCaseSensitive(query),
            query
        }, self.onResponse);
    };
    self.onResponse = function(response) {
        var items = response.bookmarks;
        if (folderOnly) {
            items = onlyFolders(items);
        }
        omnibar.listURLs(items, true);

        if (!omnibar.resultsDiv.querySelector('li.focused')) {
            var items = omnibar.resultsDiv.querySelectorAll('#sk_omnibarSearchResult>ul>li');
            omnibar.focusItem(items[lastFocused]);
        }
    };

    return self;
}
