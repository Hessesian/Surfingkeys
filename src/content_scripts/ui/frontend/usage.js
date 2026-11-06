import KeyboardUtils from '../../common/keyboardUtils';
import Mode from '../../common/mode';
import {
    getAnnotations,
    htmlEncode,
    initL10n,
    setSanitizedContent,
} from '../../common/utils.js';

export function localizeAnnotation(locale, annotation) {
    if (annotation.constructor.name === "Array") {
        const fmt = annotation[0];
        return locale(fmt).format(...annotation.slice(1));
    } else {
        return locale(annotation);
    }
}

// The usage popup (`?`), and the visual-mode commands that act on it when it is the thing up.
export default function installUsage(self, { visual, omnibar, showElement }) {
    const _actions = self._actions;
    const _usage = document.getElementById('sk_usage');

    self.visualCommand = function(args) {
        if (_usage.style.display !== "none") {
            // visual mode in frontend.html, such as help
            visual[args.action](args.query);
        } else {
            // visual mode for all content windows
            self.contentCommand(args);
        }
    };

    function buildUsage(metas, cb) {
        var feature_groups = [
            'Help',                  // 0
            'Mouse Click',           // 1
            'Scroll Page / Element', // 2
            'Tabs',                  // 3
            'Page Navigation',       // 4
            'Sessions',              // 5
            'Search selected with',  // 6
            'Clipboard',             // 7
            'Omnibar',               // 8
            'Visual Mode',           // 9
            'vim-like marks',        // 10
            'Settings',              // 11
            'Chrome URLs',           // 12
            'Proxy',                 // 13
            'Misc',                  // 14
            'Insert Mode',           // 15
            'Lurk Mode',             // 16
            'Regional Hints Mode',   // 17
        ];

        initL10n(function(locale) {
            var help_groups = feature_groups.map(function(){return [];});
            const lh = Mode.specialKeys["<Alt-s>"].length;
            if (lh > 0) {
                help_groups[0].push("<div><span class=kbd-span><kbd>{0}</kbd></span><span class=annotation>{1}</span></div>".format(
                    htmlEncode(Mode.specialKeys["<Alt-s>"][lh - 1]), locale("Toggle SurfingKeys on current site")));
            }

            metas = metas.concat(getAnnotations(omnibar.mappings));
            metas.forEach(function(meta) {
                const w = KeyboardUtils.decodeKeystroke(meta.word);
                const annotation = localizeAnnotation(locale, meta.annotation);
                const item = `<div><span class=kbd-span><kbd>${htmlEncode(w)}</kbd></span><span class=annotation>${annotation}</span></div>`;
                help_groups[meta.feature_group].push(item);
            });
            help_groups = help_groups.map(function(g, i) {
                if (g.length) {
                    return "<div><div class=feature_name><span>{0}</span></div>{1}</div>".format(locale(feature_groups[i]), g.join(''));
                } else {
                    return "";
                }
            }).join("");

            help_groups += `<p style='float:right; width:100%; text-align:right'><a href='https://github.com/brookhong/surfingkeys' target='_blank' style='color:#0095dd'>${locale("More help")}</a></p>`;
            cb(help_groups);
        });
    }

    _actions['showUsage'] = function(message) {
        showElement(_usage, () => {
            buildUsage(message.metas, function(usage) {
                setSanitizedContent(_usage, usage);
            });
        });
    };
    _actions['getUsage'] = function (message) {
        // send response in callback from buildUsage
        delete message.ack;
        buildUsage(message.metas, function(usage) {
            top.postMessage({surfingkeys_uihost_data: {
                data: usage,
                toContent: true,
                id: message.id
            }}, self.topOrigin);
        });
    };

    self.showUsage = self.hidePopup;
}
