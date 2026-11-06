import KeyboardUtils from '../../common/keyboardUtils';
import { RUNTIME, runtime } from '../../common/runtime.js';
import { constructSearchURL, tabOpenLink, toggleQuote } from '../../common/utils.js';
import { nextPageNumber, prevPageNumber, rotatedIndex } from '../../../core/omnibar';
import { getPosition } from './state';

// The omnibar's own keys (self.mappings), run by Mode.handleMapKey before the input sees them.
export default function installKeymap(self, st, { front, searchEngine, listResultPage, escapePressed }) {
    const position = () => getPosition(st, runtime);

    function reopen(cb) {
        front.hidePopup();
        setTimeout(cb, 100);
    }

    function rotateResult(backward) {
        var items = Array.from(self.resultsDiv.querySelectorAll('#sk_omnibarSearchResult>ul>li'));
        var total = items.length;
        if (total > 0) {
            var fi = self.resultsDiv.querySelector('li.focused');
            if (fi) {
                fi.classList.remove('focused');
            }
            var toFocus = rotatedIndex(total, items.indexOf(fi), backward);
            if (toFocus < total) {
                self.focusItem(items[toFocus]);
                st.handler.onTabKey && st.handler.onTabKey();
            } else {
                self.input.value = st.lastInput;
            }
        }
    }

    self.mappings.add(KeyboardUtils.encodeKeystroke("<Ctrl-d>"), {
        annotation: "Delete focused item from bookmark or history",
        feature_group: 8,
        code: function () {
            var fi = self.resultsDiv.querySelector('li.focused');
            if (fi && fi.uid) {
                RUNTIME("removeURL", {
                    uid: fi.uid
                }, function(ret) {
                    if (ret.response === "Done") {
                        var newFI = (position() !== "bottom") ? fi.nextElementSibling : fi.previousElementSibling;
                        fi.remove();
                        if (newFI) {
                            self.focusItem(newFI);
                        } else {
                            st.savedFocused = (position() !== "bottom") ?
                                self.resultsDiv.querySelectorAll('#sk_omnibarSearchResult>ul>li').length : 0;
                            self.input.dispatchEvent(new Event('input', { bubbles: true }));
                        }
                    }
                });
            }
        }
    });

    self.mappings.add(KeyboardUtils.encodeKeystroke("<Ctrl-i>"), {
        annotation: "Edit selected URL with vim editor, then open",
        feature_group: 8,
        code: function () {
            var fi = self.resultsDiv.querySelector('li.focused');
            if (fi && fi.url) {
                reopen(function () {
                    front.showEditor({
                        initial_line: 1,
                        type: "url",
                        content: fi.url,
                        onEditorSaved: function(data) {
                            data && tabOpenLink(data);
                        }
                    });
                });
            } else if (st.handler === searchEngine) {
                var query = self.input.value;
                var url = searchEngine.url;
                reopen(function () {
                    front.showEditor({
                        initial_line: 1,
                        type: "url",
                        content: query,
                        onEditorSaved: function(data) {
                            tabOpenLink(constructSearchURL(url, encodeURIComponent(data)));
                        }
                    });
                });
            }
        }
    });

    self.mappings.add(KeyboardUtils.encodeKeystroke("<Ctrl-j>"), {
        annotation: "Toggle Omnibar's position",
        feature_group: 8,
        code: function () {
            const savedInput = self.input.value;
            if (runtime.conf.omnibarPosition === "bottom") {
                runtime.conf.omnibarPosition = "middle";
            } else {
                runtime.conf.omnibarPosition = "bottom";
            }
            reopen(function() {
                st.savedArgs.pref = savedInput;
                front.openOmnibar(st.savedArgs);
            });
        }
    });

    self.mappings.add(KeyboardUtils.encodeKeystroke("<Ctrl-.>"), {
        annotation: "Show results of next page",
        feature_group: 8,
        code: function () {
            if (st.items) {
                st.start = nextPageNumber(st.start, runtime.conf.omnibarMaxResults, st.items.length);
                listResultPage();
            }
        }
    });

    self.mappings.add(KeyboardUtils.encodeKeystroke("<Ctrl-,>"), {
        annotation: "Show results of previous page",
        feature_group: 8,
        code: function () {
            if (st.items) {
                st.start = prevPageNumber(st.start, runtime.conf.omnibarMaxResults, st.items.length);
                listResultPage();
            }
        }
    });

    self.mappings.add(KeyboardUtils.encodeKeystroke("<Ctrl-c>"), {
        annotation: "Copy selected item url or all listed item urls",
        feature_group: 8,
        code: function () {
            const fi = self.resultsDiv.querySelector('li.focused');
            let text;
            if (fi && fi.copy) {
                text = fi.copy;
            } else if (fi && fi.url) {
                text = fi.url;
            } else if (st.page) {
                text = st.page.map(p => {
                    return p.url;
                }).join("\n")
            }
            self.copy(text);
        }
    });

    self.mappings.add(KeyboardUtils.encodeKeystroke("<Ctrl-D>"), {
        annotation: "Delete all listed items from bookmark or history",
        feature_group: 8,
        code: function () {
            var uids = Array.from(self.resultsDiv.querySelectorAll('#sk_omnibarSearchResult>ul>li')).map(function(li) {
                return li.uid;
            }).filter(function(u) {
                return u;
            });
            if (uids.length) {
                RUNTIME("removeURL", {
                    uid: uids
                }, function(ret) {
                    if (ret.response === "Done") {
                        if (st.handler && st.handler.getResults) {
                            st.handler.getResults();
                        }
                        self.triggerInput();
                    }
                });
            }
        }
    });

    self.mappings.add(KeyboardUtils.encodeKeystroke("<Ctrl-r>"), {
        annotation: "Re-sort history by visitCount or lastVisitTime",
        feature_group: 8,
        code: function () {
            if (st.handler && st.handler.onReset) {
                st.handler.onReset();
            }
        }
    });

    self.mappings.add(KeyboardUtils.encodeKeystroke("<Esc>"), {
        annotation: "Close Omnibar",
        feature_group: 8,
        code: function () {
            escapePressed();
        }
    });

    self.mappings.add(KeyboardUtils.encodeKeystroke("<Ctrl-m>"), {
        annotation: "Create vim-like mark for selected item",
        feature_group: 8,
        code: function (mark) {
            var fi = self.resultsDiv.querySelector('li.focused');
            if (fi) {
                Normal.addVIMark(mark, fi.url);
            }
        }
    });

    self.mappings.add(KeyboardUtils.encodeKeystroke("<Tab>"), {
        annotation: "Forward cycle through the candidates.",
        feature_group: 8,
        code: function () {
            rotateResult(position() === "bottom");
        }
    });
    self.mappings.add(KeyboardUtils.encodeKeystroke("<Shift-Tab>"), {
        annotation: "Backward cycle through the candidates.",
        feature_group: 8,
        code: function () {
            rotateResult(position() !== "bottom");
        }
    });
    self.mappings.add(KeyboardUtils.encodeKeystroke("<Ctrl-n>"), {
        annotation: "Forward cycle through the input history.",
        feature_group: 8,
        code: function () {
            if (st.handler && st.handler.rotateInput) {
                st.handler.rotateInput(position() === "bottom");
            } else {
                rotateResult(position() === "bottom");
            }
        }
    });
    self.mappings.add(KeyboardUtils.encodeKeystroke("<Ctrl-p>"), {
        annotation: "Backward cycle through the input history.",
        feature_group: 8,
        code: function () {
            if (st.handler && st.handler.rotateInput) {
                st.handler.rotateInput(position() !== "bottom");
            } else {
                rotateResult(position() !== "bottom");
            }
        }
    });
    self.mappings.add(KeyboardUtils.encodeKeystroke("<Ctrl-'>"), {
        annotation: "Toggle quotes in an input element",
        feature_group: 8,
        code: toggleQuote
    });
}
