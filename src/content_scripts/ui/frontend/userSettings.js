import Mode from '../../common/mode';
import { runtime } from '../../common/runtime.js';
import { mapInMode, setSanitizedContent } from '../../common/utils.js';

// What the content script pushes down from the user's settings and mappings.
export default function installUserSettings(self, { hints, omnibar, modes }) {
    const _actions = self._actions;
    _actions['applyUserSettings'] = function (message) {
        for (var k in message.userSettings) {
            if (runtime.conf.hasOwnProperty(k)) {
                runtime.conf[k] = message.userSettings[k];
            }
        }
        if ('theme' in message.userSettings) {
            setSanitizedContent(document.getElementById("sk_theme"), message.userSettings.theme);
        }
    };
    _actions['setHintsCharacters'] = function (message) {
        hints.setCharacters(message.characters);
    };
    _actions['addMapkey'] = function (message) {
        if (message.old_keystroke in Mode.specialKeys) {
            Mode.specialKeys[message.old_keystroke].push(message.new_keystroke);
        } else if (modes.hasOwnProperty(message.mode)) {
            mapInMode(modes[message.mode], message.new_keystroke, message.old_keystroke);
        }
    };
    _actions['addCommand'] = function(message) {
        const proxyAction = (...args) => {
            self.contentCommand({
                action: 'executeUserCommand',
                name: message.name,
                args: args
            });
        };
        omnibar.command(message.name, message.description, proxyAction);
    };
}
