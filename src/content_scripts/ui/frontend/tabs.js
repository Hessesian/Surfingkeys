import KeyboardUtils from '../../common/keyboardUtils';
import Mode from '../../common/mode';
import { RUNTIME, runtime } from '../../common/runtime.js';
import {
    attachFaviconToImgSrc,
    createElementWithContent,
    htmlEncode,
    refreshHints,
    setSanitizedContent,
} from '../../common/utils.js';

// The tab chooser, the tab group chooser, and the hint keys that pick from either.
export default function installTabs(self, st, { hints, showElement }) {
    const _actions = self._actions;
    const _omnibar = document.getElementById('sk_omnibar');
    const _tabs = document.getElementById('sk_tabs');
    var pressedHintKeys = "";
    self.addEventListener('keydown', function(event) {
        if (Mode.isSpecialKeyOf("<Esc>", event.sk_keyName)) {
            self.hidePopup();
            event.sk_stopPropagation = true;
        } else if (st.display && st.display.style.display !== "none") {
            const tabHints = st.display.querySelectorAll('div>div.sk_tab_hint');
            if (tabHints.length > 0) {
                const key = event.sk_keyName;
                const characters = hints.getCharacters().toLowerCase();
                if (event.keyCode === KeyboardUtils.keyCodes.backspace) {
                    if (pressedHintKeys.length > 0) {
                        pressedHintKeys = pressedHintKeys.substr(0, pressedHintKeys.length - 1);
                        refreshHints(tabHints, pressedHintKeys);
                    }
                } else if (characters.indexOf(key.toLowerCase()) !== -1) {
                    pressedHintKeys = pressedHintKeys + key.toUpperCase();
                    const hintState = refreshHints(tabHints, pressedHintKeys);
                    if (hintState.matched) {
                        st.display.onHit(hintState.matched);
                        pressedHintKeys = "";
                        self.hidePopup();
                    } else if (hintState.candidates === 0) {
                        pressedHintKeys = "";
                        self.hidePopup();
                    }
                } else {
                    showElement(_omnibar, () => {
                        _omnibar.onShow({type: 'Tabs'});
                    });
                }

                event.sk_stopPropagation = true;
            }
        }
    });

    function renderTabTitles(container, tabs) {
        tabs.forEach(function(t, i) {
            const tab = createElementWithContent('div', `<div class=sk_tab_wrap><div class=sk_tab_icon><img/></div><div class=sk_tab_title>${htmlEncode(t.title)}</div></div>`, { "class": 'sk_tab' });
            if (t.active) {
                tab.classList.add("active");
            }
            attachFaviconToImgSrc(t, tab.querySelector("img"));
            container.append(tab);
        });
    }
    function renderTabs(container, tabs) {
        setSanitizedContent(container, "");
        var hintLabels = hints.genLabels(tabs.length - 1);
        const unitWidth = (window.innerWidth - 2) / tabs.length - 2;
        const verticalTabs = runtime.conf.verticalTabs;
        container.className = verticalTabs ? "vertical" : "horizontal";
        renderTabTitles(container, tabs);
        if (verticalTabs) {
            container.querySelectorAll("div.sk_tab").forEach((tab) => {
                tab.append(createElementWithContent('div', '🚀', {class: "tab_rocket"}));
            });
        } else {
            container.querySelectorAll("div.sk_tab").forEach((tab) => {
                tab.querySelector("div.sk_tab_title").style.width = (unitWidth - 24) + 'px';
                tab.style.width = unitWidth + 'px';
            });
        }
        const tabsNeedHint = tabs.filter((t) => !t.active);
        container.querySelectorAll("div.sk_tab:not(.active)").forEach((tab, i) => {
            const tabHint = createElementWithContent('div', hintLabels[i], { "class": 'sk_tab_hint' });
            const tabData = tabsNeedHint[i];
            tabHint.label = hintLabels[i];
            tabHint.link = {id: tabData.id, windowId: tabData.windowId};
            tab.prepend(tabHint);
        });
        if (container.getBoundingClientRect().height > self.topSize[1]) {
            container.className = "inline";
        }
    }
    _actions['chooseTab'] = function() {
        const tabsThreshold = Math.min(runtime.conf.tabsThreshold, Math.ceil(window.innerWidth / 26));
        RUNTIME('getTabs', {queryInfo: {currentWindow: true}, tabsThreshold}, function(response) {
            if (response.tabs.length > tabsThreshold) {
                showElement(_omnibar, () => {
                    _omnibar.onShow({type: 'Tabs'});
                });
            } else if (response.tabs.length > 0) {
                showElement(_tabs, () => {
                    renderTabs(_tabs, response.tabs);
                }, (matched) => {
                    RUNTIME('focusTab', {
                        windowId: matched.windowId,
                        tabId: matched.id
                    });
                });
            }
        });
    };
    self.chooseTab = _actions['chooseTab'];
    _actions['openContainer'] = function() {
        showElement(_omnibar, () => {
            _omnibar.onShow({type: 'Containers'});
        });
    };
    self.openContainer = _actions['openContainer'];
    _actions['groupTab'] = function() {
        RUNTIME('getTabGroups', {}, function(response) {
            const groups = response.groups;
            if (groups.length === 0) {
                self.openOmnibar({type: "Commands", pref: "createTabGroup"});
                return;
            }

            showElement(_tabs, () => {
                setSanitizedContent(_tabs, "");
                _tabs.className = "";
                const hintLabels = hints.genLabels(groups.length*2 + 1);
                groups.forEach(function(g, i) {
                    const group = document.createElement('div');
                    group.setAttribute('class', 'sk_tab_group');
                    const labels = [hintLabels[2*i],hintLabels[2*i + 1]];
                    setSanitizedContent(group, `<div class=sk_tab_group_header><div><div class=sk_tab_hint>${labels[0]}</div><span class=sk_tab_group_title></span></div><div><div class=sk_tab_hint>${labels[1]}</div><span class=sk_tab_group_state></span></div></div><div class=sk_tab_group_details></div>`);
                    renderTabTitles(group.querySelector("div.sk_tab_group_details"), g.tabs);
                    const activeState = g.active ? '☑' : '☐';
                    setSanitizedContent(group.querySelector("span.sk_tab_group_title"), activeState + htmlEncode(g.title));
                    const collapsedState = g.collapsed ? '☑' : '☐';
                    setSanitizedContent(group.querySelector("span.sk_tab_group_state"), collapsedState + "Collapsed");
                    const tabHints = group.querySelectorAll("div.sk_tab_hint");
                    tabHints[0].label = labels[0];
                    tabHints[0].link = {id: g.id, active: g.active, action: "group"};
                    tabHints[1].label = labels[1];
                    tabHints[1].link = {id: g.id, collapsed: g.collapsed, action: "collapse"};
                    _tabs.append(group);
                });
                const newTabGroup = createElementWithContent('div', `<div class=sk_tab_hint>${hintLabels[groups.length*2]}</div> New tab group`, { "class": 'sk_tab_group' });
                const tabHint = newTabGroup.querySelector("div.sk_tab_hint");
                tabHint.label = hintLabels[groups.length*2];
                tabHint.link = {action: "new"};
                _tabs.append(newTabGroup);
            }, (matched) => {
                if (matched.action === "collapse") {
                    RUNTIME('collapseGroup', {groupId: matched.id, collapsed: !matched.collapsed});
                } else if (matched.action === "new") {
                    setTimeout(() => {
                        self.openOmnibar({type: "Commands", pref: "createTabGroup"});
                    }, 10);
                } else {
                    if (matched.active) {
                        RUNTIME('ungroupTab');
                    } else {
                        RUNTIME('createTabGroup', {groupId: matched.id});
                    }
                }
            });
        });
    };
}
