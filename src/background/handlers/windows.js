export default function registerWindows(bg) {
    const {self, _response} = bg;
    const focusTab = (...args) => bg.focusTab(...args);

    let previousWindowChoice = -1;
    self.getWindows = function (message, sender, sendResponse) {
        chrome.tabs.query({currentWindow: false}, function(tabs) {
            const windows = {};
            tabs.forEach(t => {
                const tabsInWindow = windows[t.windowId] || [];
                tabsInWindow.push({title: t.title, url: t.url});
                windows[t.windowId] = tabsInWindow;
            });
            _response(message, sendResponse, {
                windows: Object.keys(windows).map(w => {
                    return {
                        id: w,
                        tabs: windows[w],
                        isPreviousChoice: (parseInt(w) === previousWindowChoice)
                    };
                })
            });
        });
    };
    self.moveToWindow = function(message, sender, sendResponse) {
        if (message.windowId === -1) {
            chrome.windows.create({tabId: sender.tab.id});
        } else {
            chrome.tabs.move(sender.tab.id, {windowId: message.windowId, index: -1}, () => {
                focusTab(message.windowId, sender.tab.id);
            });
        }
        previousWindowChoice = message.windowId;
    };
    self.gatherWindows = function(message, sender, sendResponse) {
        const windowId = sender.tab.windowId;
        chrome.tabs.query({currentWindow: false}, function(tabs) {
            tabs.forEach(function(tab) {
                chrome.tabs.move(tab.id, {windowId, index: -1});
            });
        });
    };
    self.gatherTabs = function(message, sender, sendResponse) {
        const windowId = sender.tab.windowId;
        message.tabs.forEach(function(tab) {
            chrome.tabs.move(tab.id, {windowId, index: -1});
        });
    };
}
