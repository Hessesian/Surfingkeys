import { RUNTIME, runtime } from '../../common/runtime.js';
import { createElementWithContent, setSanitizedContent, showBanner } from '../../common/utils.js';
import { bookmarkTarget, matchFolders } from '../../../core/omnibar';
import { separatorHtml } from './constants';

export default function AddBookmark(omnibar) {
    var self = {
        focusFirstCandidate: true,
        prompt: `add bookmark${separatorHtml}`
    }, folders, origFFC;

    self.onOpen = function(arg) {
        self.page = arg;
        omnibar.listBookmarkFolders(function(response) {
            folders = response.folders;
            omnibar.listResults(folders.slice(), function(f) {
                return createElementWithContent('li', `▷ ${f.title}`, {folder: f.id});
            });
            RUNTIME("getBookmark", null, function(resp) {
                if (resp.bookmarks.length) {
                    var b = resp.bookmarks[0];
                    setSanitizedContent(omnibar.promptSpan, `edit bookmark${separatorHtml}`);
                    omnibar.resultsDiv.querySelector('li.focused').classList.remove('focused');
                    omnibar.focusItem(`li[folder="${b.parentId}"]`);
                }

                //restore the last used bookmark folder input
                var lastBookmarkFolder = localStorage.getItem("surfingkeys.lastAddedBookmark");
                if (lastBookmarkFolder) {
                    omnibar.input.value = lastBookmarkFolder;

                    //make the input selected, so if user don't want to use it,
                    //just input to overwrite the previous value
                    omnibar.input.select();

                    // trigger omnibar input matching
                    self.onInput();
                }
            });
        });
    };

    self.onTabKey = function() {
        var fi = omnibar.resultsDiv.querySelector('li.focused');
        omnibar.input.value = fi.innerHTML.substr(2);
    };

    self.onEnter = function() {
        self.page.path = [];
        var fi = omnibar.resultsDiv.querySelector('li.focused');
        var folderName;
        if (fi) {
            self.page.folder = fi.getAttribute('folder');
            folderName = fi.innerHTML.substr(2);
        } else {
            const target = bookmarkTarget(omnibar.input.value, folders);
            if (target.title.length) {
                self.page.title = target.title;
            }
            self.page.path = target.path;
            if (target.folder !== undefined) {
                self.page.folder = target.folder;
                folderName = target.folderName;
            }
            if (self.page.folder === undefined) {
                self.page.folder = folders[0].id;
                folderName = `${folders[0].title}${target.path.join("/")}`;
            }
        }
        RUNTIME('createBookmark', {
            page: self.page
        }, function(response) {
            showBanner("Bookmark created at {0}.".format(folderName), 3000);
        });
        localStorage.setItem("surfingkeys.lastAddedBookmark", omnibar.input.value);
        return true;
    };

    self.onInput = function() {
        var query = omnibar.input.value;
        var matches = matchFolders(folders, query, runtime.getCaseSensitive(query));
        omnibar.listResults(matches, function(f) {
            return createElementWithContent('li', `▷ ${f.title}`, {folder: f.id});
        });
    };

    return self;
}
