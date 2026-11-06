import { generateQuickGuid, initSKFunctionListener } from '../common/utils.js';
import Mode from '../common/mode';
import createClipboard from '../common/clipboard.js';
import createInsert from '../common/insert.js';
import createNormal from '../common/normal.js';
import createVisual from '../common/visual.js';
import createHints from '../common/hints.js';
import createAPI from '../common/api.js';
import createDefaultMappings from '../common/default.js';
import createOmnibar from './omnibar.js';
import createCommands from './command.js';
import installDisplay from './frontend/display.js';
import installTabs from './frontend/tabs.js';
import installUsage from './frontend/usage.js';
import installUserSettings from './frontend/userSettings.js';
import installPopup from './frontend/popup.js';
import installEditor from './frontend/editor.js';
import installOmnibarActions from './frontend/omnibarActions.js';
import installBanner from './frontend/banner.js';
import installBubble from './frontend/bubble.js';
import installKeystroke from './frontend/keystroke.js';
import createStatusBar from './frontend/statusBar.js';
import createFind from './frontend/find.js';

// The iframe's front end: wires one module per widget (./frontend/) onto the "Front" mode and
// answers the `_actions` messages the content script posts. Members the LLM chat and the omnibar
// call (contentCommand, postMessage, hidePopup, openOmnibar, revealOmnibar, showEditor,
// addDestroyListener, topOrigin) are set on `self` by the modules or here and must keep working.
const Front = (function() {
    const clipboard = createClipboard();
    Mode.init();
    const insert = createInsert();
    const normal = createNormal(insert);
    normal.enter();
    const hints = createHints(insert, normal, clipboard);
    const visual = createVisual(clipboard, hints);

    const self = new Mode("Front");
    self._actions = {};
    self.topSize = [0, 0];
    let destroyListeners = [];
    self.addDestroyListener = (task) => {
        destroyListeners.push(task);
    };
    const omnibar = createOmnibar(self, clipboard);

    createCommands(normal, omnibar.command, omnibar);

    const modes = {
        Insert: insert,
        Normal: normal,
        Visual: visual,
        Omnibar: omnibar,
    };

    const api = createAPI(clipboard, insert, normal, hints, visual, self, {});
    createDefaultMappings(api, clipboard, insert, normal, hints, visual, self);

    var _actions = self._actions,
        _callbacks = {};
    self.contentCommand = function(args, successById) {
        args.toContent = true;
        args.id = generateQuickGuid();
        if (successById) {
            args.ack = true;
            _callbacks[args.id] = successById;
        }
        top.postMessage({surfingkeys_uihost_data: args}, self.topOrigin);
    };

    self.postMessage = function(args) {
        top.postMessage({surfingkeys_uihost_data: args}, self.topOrigin);
    };

    // `display` is the popup that is up. Tabs, the hint keys, hidePopup and the destroy check all read it.
    const st = { display: undefined };

    self.statusBar = document.getElementById('sk_status');
    const { setDisplay, showElement } = installDisplay(self, st);
    installTabs(self, st, { hints, showElement });
    installUsage(self, { visual, omnibar, showElement });
    installUserSettings(self, { hints, omnibar, modes });
    const showPopup = installPopup(self, { hints, showElement });
    installEditor(self, { normal, showElement });
    const StatusBar = createStatusBar(self);
    const Find = createFind(self, StatusBar);
    installOmnibarActions(self, { omnibar, find: Find, showElement });
    const showBanner = installBanner(self);
    installBubble(self, { setDisplay });

    _actions['visualUpdated'] = function(message) {
        self.statusBar.querySelector('input').focus();
    };

    _actions['showStatus'] = function(message) {
        StatusBar.show(message.contents, message.duration);
    };

    initSKFunctionListener("front", {
        showPopup,
        showBanner,
        openFinder: () => {
            Find.open();
        },
        showStatus: (contents, duration) => {
            StatusBar.show(contents, duration);
        },
    });

    self.toggleStatus = function(visible) {
        if (visible) {
            self.statusBar.style.display = "";
        } else {
            self.statusBar.style.display = "none";
        }
    };
    _actions['toggleStatus'] = function(message) {
        self.toggleStatus(message.visible);
    };

    installKeystroke(self);

    _actions['initFrontend'] = function(message) {
        self.topOrigin = message.origin;
        self.topSize = message.winSize;
        return new Date().getTime();
    };
    _actions['destroyFrontend'] = function(message) {
        if (st.display && st.display.style.display !== "none") {
            return false;
        }
        for (const task of destroyListeners) {
            task();
        }
        return true;
    };

    window.addEventListener('message', function(event) {
        var _message = event.data && event.data.surfingkeys_frontend_data;
        if (_message === undefined) {
            return;
        }
        if (_callbacks[_message.id]) {
            var f = _callbacks[_message.id];
            // returns true to make callback stay for coming response.
            if (!f(_message)) {
                delete _callbacks[_message.id];
            }
        } else if (_message.action && _actions.hasOwnProperty(_message.action)) {
            var ret = _actions[_message.action](_message);
            if (_message.ack) {
                top.postMessage({surfingkeys_uihost_data: {
                    data: ret,
                    action: _message.action + "Ack",
                    toContent: true,
                }}, self.topOrigin);
            }
        }
    }, true);

    return self;
})();

export default Front;
