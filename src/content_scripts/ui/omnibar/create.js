import Trie from '../../common/trie';
import Mode from '../../common/mode';
import LLMChat from '../llmchat';
import { createState } from './state';
import installResults from './results';
import installApi from './api';
import installAlias from './alias';
import installKeymap from './keymap';
import installSession from './session';
import OpenBookmarks from './bookmarks';
import AddBookmark from './addBookmark';
import { AllURLs, HistoryURLs, RecentlyClosedURLs, TabHistoryURLs } from './urls';
import { CloseTabs, OpenTabs } from './tabs';
import OpenWindows from './windows';
import OpenVIMarks from './vimarks';
import SearchEngine from './searchEngine';
import Commands from './commands';
import OpenContainers from './containers';
import OmniQuery from './omniQuery';
import OpenUserURLs from './userURLs';

// Wires the omnibar: the Mode and its shared state, the modules that add members to it, then
// the handlers. The handlers are registered in the order the omnibar always had them.
export default function createOmnibar(front, clipboard) {
    var self = new Mode("Omnibar");
    const ui = document.getElementById('sk_omnibar');
    const st = createState(ui);

    self.addEventListener('keydown', function(event) {
        if (event.sk_keyName.length) {
            Mode.handleMapKey.call(self, event);
        }
        event.sk_suppressed = true;
    }).addEventListener('mousedown', function(event) {
        if (!ui.contains(event.target)) {
            front.hidePopup();
        }
        event.sk_suppressed = true;
    });

    self.mappings = new Trie();
    self.map_node = self.mappings;

    self.promptSpan = ui.querySelector('#sk_omnibarSearchArea>span.prompt');
    self.resultsDiv = ui.querySelector('#sk_omnibarSearchResult');

    const searchEngine = SearchEngine(self, front);

    installApi(self, st, { clipboard, searchEngine });
    installAlias(self, st, searchEngine);
    const { listResultPage } = installResults(self, st);
    const { escapePressed } = installSession(self, st, front);
    installKeymap(self, st, { front, searchEngine, listResultPage, escapePressed });

    self.addHandler('Bookmarks', OpenBookmarks(self));
    self.addHandler('AddBookmark', AddBookmark(self));
    self.addHandler('History', HistoryURLs(self));
    self.addHandler('URLs', AllURLs(self));
    self.addHandler('RecentlyClosed', RecentlyClosedURLs(self));
    self.addHandler('TabURLs', TabHistoryURLs(self));
    self.addHandler('Tabs', OpenTabs(self));
    self.addHandler('CloseTabs', CloseTabs(self));
    self.addHandler('Windows', OpenWindows(self, front));
    self.addHandler('VIMarks', OpenVIMarks(self));
    self.addHandler('SearchEngine', searchEngine);
    self.addHandler('Commands', Commands(self, front));
    self.addHandler('Containers', OpenContainers(self, front));
    self.addHandler('OmniQuery', OmniQuery(self, front));
    self.addHandler('UserURLs', OpenUserURLs(self, front));
    self.addHandler('LLMChat', LLMChat(self, front));

    front._actions['updateOmnibarResult'] = function(message) {
        self.listWords(message.words);
    };
    return self;
}
