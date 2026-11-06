import Mode from '../mode';
import KeyboardUtils from '../keyboardUtils';
import Trie from '../trie';
import toMarkdown from '../pageMarkdown.js';
import { createElementWithContent, getAnnotations, htmlEncode, openOmnibar } from '../utils.js';
import placeHintsHost from './host.js';

export default
function createRegionalHints(clipboard, createOverlay) {
    const self = new Mode("RegionalHints");

    self.mappings = new Trie();
    self.map_node = self.mappings;

    const regionalHintsHost = document.createElement("div");
    regionalHintsHost.className = "surfingkeys_hints_host";
    regionalHintsHost.attachShadow({ mode: 'open' });
    const hintsStyle = createElementWithContent('style', `
div.menu {
    font-size: 14px;
    color: #fff;
}
div.menu-item {
    display: inline-block;
    padding: 4px;
    margin: 4px;
    background: #454545;
    box-shadow: inset 0 -1px 0 #bbb;
    border-radius: 3px;
    font-size: 14px;
}
kbd {
    white-space: nowrap;
    display: inline-block;
    padding: 3px 5px;
    font: 14px Consolas, "Liberation Mono", Menlo, Courier, monospace;
    line-height: 10px;
    vertical-align: middle;
    border: solid 1px #ccc;
    border-bottom-color: #bbb;
    border-radius: 3px;
    box-shadow: inset 0 -1px 0 #bbb;
    margin-right: 4px;
}
`);
    regionalHintsHost.shadowRoot.appendChild(hintsStyle);

    self.mappings.add(KeyboardUtils.encodeKeystroke("<Esc>"), {
        annotation: "Exit regional hints mode",
        feature_group: 17,
        code: function() {
            self.exit();
        }
    });

    self.mappings.add("ct", {
        annotation: "copy text from target element",
        feature_group: 17,
        code: function() {
            clipboard.write(overlay.link.innerText);
        }
    });

    self.mappings.add("ch", {
        annotation: "copy html from target element",
        feature_group: 17,
        code: function() {
            clipboard.write(overlay.link.innerHTML);
        }
    });

    self.mappings.add("d", {
        annotation: "delete target element",
        feature_group: 17,
        code: function() {
            overlay.link.remove();
            self.exit();
        }
    });

    self.mappings.add("l", {
        annotation: "learn more about target element",
        feature_group: 17,
        code: function() {
            // the element the user picked, which `read_page` serves in place of the
            // whole page -- as Markdown, so the links and images inside it survive
            openOmnibar({type: "LLMChat", extra: {picked: toMarkdown(overlay.link)}});
            self.exit();
        }
    });

    let overlay = null;

    const buildMenu = () => {
        const menu = createElementWithContent('div', "", {class: "menu"});
        getAnnotations(self.mappings).forEach((b) => {
            const menuItem = createElementWithContent('div', "", {class: "menu-item"});
            menuItem.appendChild(createElementWithContent('kbd', htmlEncode(KeyboardUtils.decodeKeystroke(b.word))));
            menuItem.appendChild(createElementWithContent('span', b.annotation));
            menu.appendChild(menuItem);
        });
        return menu;
    };

    self.addEventListener('keydown', function(event) {
        Mode.handleMapKey.call(self, event);
    });

    self.onExit = function() {
        overlay.remove();
        regionalHintsHost.remove();
    };
    self.attach = (elm) => {
        if (overlay) overlay.remove();
        overlay = elm;
        if (overlay.link.parentElement) {
            self.mappings.add("p", {
                annotation: "select parent element",
                feature_group: 17,
                code: function() {
                    const parent = overlay.link.parentElement;
                    if (!parent) {
                        return;
                    }
                    const newOverlay = createOverlay(parent, overlay.link.skColorIndex, "99");
                    newOverlay.link = parent;
                    self.attach(newOverlay);
                }
            });
        } else {
            self.mappings.remove("p");
        }
        regionalHintsHost.shadowRoot.appendChild(overlay);
        placeHintsHost(regionalHintsHost);
        overlay.appendChild(buildMenu());
        self.enter();
    };
    self.onScrollStarted = () => {
        if (!document.documentElement.contains(regionalHintsHost)) {
            return;
        }
        overlay.style.display = "none";
    };
    self.onScrollDone = () => {
        const be = overlay.link.getBoundingClientRect();
        overlay.style.top = Math.max(0, Math.min(be.top, window.innerHeight - overlay.offsetHeight)) + "px";
        overlay.style.left = Math.max(0, Math.min(be.left, window.innerWidth - overlay.offsetWidth)) + "px";
        overlay.style.display = "";
    };
    return self;
}
