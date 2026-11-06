export default function registerDownloads(bg) {
    const {self, _response} = bg;

    self.closeDownloadsShelf = function(message, sender, sendResponse) {
        if (message.clearHistory) {
            chrome.downloads.erase({"urlRegex": ".*"});
        } else {
            chrome.downloads.setShelfEnabled(false);
            chrome.downloads.setShelfEnabled(true);
        }
    };
    self.getDownloads = function(message, sender, sendResponse) {
        chrome.downloads.search(message.query, function(items) {
            _response(message, sendResponse, {
                downloads: items
            });
        });
    };
    self.download = function(message, sender, sendResponse) {
        chrome.downloads.download({
            url: message.url,
            filename: message.filename,
            saveAs: message.saveAs
        });
    };
}
