import { RUNTIME } from '../../common/runtime.js';
import { createElementWithContent, htmlEncode, parseAnnotation, showBanner } from '../../common/utils.js';
import { parseCommand } from '../../../core/omnibar';

export default function Commands(omnibar, front) {
    var self = {
        focusFirstCandidate: false,
        prompt: ':',
    }, items = {};

    var historyInc = 0;

    self.onOpen = function() {
        omnibar.resultsDiv.className = "commands";

        if (omnibar.input.value.length) {
            omnibar.triggerInput();
            return;
        }

        historyInc = -1;
        RUNTIME('getSettings', {
            key: 'cmdHistory'
        }, function(response) {
            var candidates = response.settings.cmdHistory;
            if (candidates.length) {
                omnibar.listResults(candidates, function(c) {
                    var li = createElementWithContent('li', c);
                    li.cmd = c;
                    return li;
                });
            }
        });
    };

    self.onReset = self.onOpen;

    self.onInput = function() {
        var cmd = omnibar.input.value;
        var candidates = Object.keys(items).filter(function(c) {
            return cmd === "" || c.indexOf(cmd) !== -1;
        });
        if (candidates.length) {
            omnibar.listResults(candidates, function(c) {
                var li = createElementWithContent('li', `${c}<span class=annotation>${htmlEncode(items[c].annotation)}</span>`);
                li.cmd = c;
                return li;
            });
        }
    };

    self.onTabKey = function() {
        omnibar.input.value = omnibar.resultsDiv.querySelector('li.focused').cmd;
    };

    self.onEnter = function() {
        var ret = false;
        var cmdline = omnibar.input.value;
        if (cmdline.length) {
            RUNTIME('updateInputHistory', { cmd: cmdline });
            execute(cmdline);
            omnibar.input.value = "";
        }
        return ret;
    };

    function execute(cmdline) {
        var args = parseCommand(cmdline);
        var cmd = args.shift();
        if (items.hasOwnProperty(cmd)) {
            var meta = items[cmd];
            meta.code.call(meta.code, args);
        } else {
            showBanner(`Unsupported command: ${cmdline}.`, 3000);
        }
    }

    front._actions['executeCommand'] = function (message) {
        execute(message.cmdline);
    };

    omnibar.command = function (cmd, annotation, jscode) {
        var cmd_code = {
            code: jscode
        };
        var ag = parseAnnotation({annotation: annotation, feature_group: 14});
        cmd_code.feature_group = ag.feature_group;
        cmd_code.annotation = ag.annotation;
        items[cmd] = cmd_code;
    };

    return self;
}
