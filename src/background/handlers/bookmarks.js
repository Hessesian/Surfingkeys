export default function registerBookmarks(bg) {
    const {self, _response} = bg;


    var bookmarkFolders = [];
    function getFolders(tree, root) {
        var cd = root;
        if (tree.title !== "" && (!tree.hasOwnProperty('url') || tree.url === undefined)) {
            cd += "/" + tree.title;
            bookmarkFolders.push({id: tree.id, title: cd + "/"});
        }
        if (tree.hasOwnProperty('children')) {
            for (var i = 0; i < tree.children.length; ++i) {
                getFolders(tree.children[i], cd);
            }
        }
    }

    function createBookmark(page, onCreated) {
        if (page.path.length) {
            chrome.bookmarks.create({
                'parentId': page.folder,
                'title': page.path.shift()
            }, function(newFolder) {
                page.folder = newFolder.id;
                createBookmark(page, onCreated);
            });
        } else {
            chrome.bookmarks.create({
                'parentId': page.folder,
                'title': page.title,
                'url': page.url
            }, function(ret) {
                onCreated(ret);
            });
        }
    }
    self.getBookmarkFolders = function(message, sender, sendResponse) {
        chrome.bookmarks.getTree(function(tree) {
            bookmarkFolders = [];
            getFolders(tree[0], "");
            _response(message, sendResponse, {
                folders: bookmarkFolders
            });
        });
    };
    self.createBookmark = function(message, sender, sendResponse) {
        removeBookmark(message.page.url, function() {
            createBookmark(message.page, function(ret) {
                _response(message, sendResponse, {
                    bookmark: ret
                });
            });
        });
    };
    function filterBookmarksByQuery(bookmarks, query, caseSensitive) {
        return bookmarks.filter(function(b) {
            var title = b.title, url = b.url;
            if (!caseSensitive) {
                title = title.toLowerCase();
                url = url && url.toLowerCase();
                query = query.toLowerCase();
            }
            return title.indexOf(query) !== -1 || (url && url.indexOf(query) !== -1);
        });
    }
    self.getBookmarks = function(message, sender, sendResponse) {
        if (message.parentId) {
            chrome.bookmarks.getSubTree(message.parentId, function(tree) {
                var bookmarks = tree[0].children;
                if (message.query && message.query.length) {
                    bookmarks = filterBookmarksByQuery(bookmarks, message.query, message.caseSensitive);
                }
                _response(message, sendResponse, {
                    bookmarks: bookmarks
                });
            });
        } else {
            if (message.query && message.query.length) {
                chrome.bookmarks.search(message.query, function(tree) {
                    _response(message, sendResponse, {
                        bookmarks: filterBookmarksByQuery(tree, message.query, message.caseSensitive)
                    });
                });
            } else {
                chrome.bookmarks.getTree(function(tree) {
                    _response(message, sendResponse, {
                        bookmarks: tree[0].children
                    });
                });
            }
        }
    };
    function removeBookmark(url, cb) {
        chrome.bookmarks.search({
            url: url
        }, function(bookmarks) {
            bookmarks.forEach(function(b) {
                chrome.bookmarks.remove(b.id);
            });
            cb && cb();
        });
    }
    self.removeBookmark = function(message, sender, sendResponse) {
        removeBookmark(sender.tab.url);
    };
    self.getBookmark = function(message, sender, sendResponse) {
        chrome.bookmarks.search({
            url: sender.tab.url
        }, function(bookmarks) {
            _response(message, sendResponse, {
                bookmarks: bookmarks
            });
        });
    };
}
