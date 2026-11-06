import KeyboardUtils from '../../common/keyboardUtils';
import Mode from '../../common/mode';
import { RUNTIME, runtime } from '../../common/runtime.js';

export default function createAceEditor(normal, front) {
    var self = new Mode("AceEditor");
    document.getElementById("sk_editor").style.height = "30%";
    var _ace = ace.edit('sk_editor');

    var originValue;
    function isDirty() {
        return _ace.getValue() != originValue;
    }

    var dialog = (function() {
        return {
            open: function(template, onEnter, options) {
                const passThrough = normal.passThrough();
                var _onClose = options.onClose;
                options.onClose = function() {
                    passThrough.exit();
                    _onClose && _onClose();
                };
                _ace.state.cm.openDialog(template, function(q) {
                    onEnter(q);
                    options.onClose();
                }, options);
            }
        };
    })();

    function _close() {
        document.activeElement.blur();
        front.hidePopup();
    }

    function _save() {
        var data = _getValue();
        if (front.onEditorSaved) {
            front.onEditorSaved(data);
            front.onEditorSaved = undefined;
        } else {
            front.contentCommand({
                action: 'ace_editor_saved',
                data: data
            });
        }
    }

    function _closeAndSave() {
        _close();
        _save();
    }

    self.addEventListener('keydown', function(event) {
        event.sk_suppressed = true;
        if (Mode.isSpecialKeyOf("<Esc>", event.sk_keyName)
            && (!_ace.completer || !_ace.completer.activated) // and completion popup not opened
        ) {
            if (runtime.conf.aceKeybindings === "emacs") {
                self.onExit = _close;
                self.exit();
            } else if (_ace.state.cm.mode === 'normal' // vim in normal mode
                && !_ace.state.cm.state.vim.status // and no pending normal operation
            ){
                if (isDirty()) {
                    dialog.open('<span style="font-family: monospace">Quit anyway? Y/n </span><input type="text"/>', function(q) {
                        if (q.toLowerCase() === 'y') {
                            self.onExit = _close;
                            self.exit();
                        }
                    }, {
                        bottom: true,
                        value: "Y",
                        onKeyDown: function(e, q, close) {
                            if (e.keyCode === KeyboardUtils.keyCodes.enter || e.keyCode === KeyboardUtils.keyCodes.ESC) {
                                close();
                            }
                        }
                    });
                } else {
                    self.onExit = _close;
                    self.exit();
                }
            }
        }
    });

    function createUrlCompleter() {
        var allVisitedURLs;
        RUNTIME('getAllURLs', null, function(response) {
            allVisitedURLs = response.urls.map(function(u) {
                var typedCount = 0, visitCount = 1;
                if (u.hasOwnProperty('typedCount')) {
                    typedCount = u.typedCount;
                }
                if (u.hasOwnProperty('visitCount')) {
                    visitCount = u.visitCount;
                }
                return {
                    caption: u.url,
                    value: u.url,
                    score: typedCount*10 + visitCount,
                    meta: 'local'
                };
            });
        });
        return {
            identifierRegexps: [/.*/],
            getCompletions: function(editor, session, pos, prefix, callback) {
                callback(null, allVisitedURLs);
            }
        };
    }

    var wordsOnPage = null;
    function getWordsOnPage(message) {
        var splitRegex = /[^a-zA-Z_0-9\$\-\u00C0-\u1FFF\u2C00-\uD7FF\w]+/;
        var words = message.split(splitRegex);
        var wordScores = {};
        words.forEach(function(word) {
            word = "sk_" + word;
            if (wordScores.hasOwnProperty(word)) {
                wordScores[word]++;
            } else {
                wordScores[word] = 1;
            }
        });

        return Object.keys(wordScores).map(function(w) {
            w = w.substr(3);
            return {
                caption: w,
                value: w,
                score: wordScores[w],
                meta: 'local'
            };
        });
    };

    var pageWordCompleter = {
        getCompletions: function(editor, session, pos, prefix, callback) {
            if (!wordsOnPage) {
                front.contentCommand({
                    action: 'getPageText'
                }, function(message) {
                    wordsOnPage = getWordsOnPage(message.data);
                    callback(null, wordsOnPage);
                });
            } else {
                callback(null, wordsOnPage);
            }
        }
    };

    ace.config.loadModule('ace/ext/language_tools', function (mod) {
        _ace.language_tools = mod;
        ace.config.loadModule('ace/autocomplete', function (mod) {
            mod.Autocomplete.startCommand.bindKey = "Tab";
            mod.Autocomplete.prototype.commands['Space'] = mod.Autocomplete.prototype.commands['Tab'];
            mod.Autocomplete.prototype.commands['Tab'] = mod.Autocomplete.prototype.commands['Down'];
            mod.Autocomplete.prototype.commands['Shift-Tab'] = mod.Autocomplete.prototype.commands['Up'];
            mod.FilteredList.prototype.filterCompletions = function(items, needle) {
                var results = [];
                var upper = needle.toUpperCase();
                loop: for (var i = 0, item; item = items[i]; i++) {
                    var caption = item.value.toUpperCase();
                    if (!caption) continue;
                    var index = caption.indexOf(upper), matchMask = 0;

                    if (index === -1)
                        continue loop;
                    matchMask = matchMask | (Math.pow(2, needle.length) - 1 << index);
                    item.matchMask = matchMask;
                    item.exactMatch = 0;
                    results.push(item);
                }
                return results;
            };
        });
        _ace.setOptions({
            enableBasicAutocompletion: true,
            enableLiveAutocompletion: false,
            enableSnippets: false
        });
    });

    var _editorType;
    function _getValue() {
        var val = _ace.getValue();
        if (_editorType === 'select') {
            // get current line
            val = _ace.session.getLine(_ace.selection.lead.row);
            val = val.match(/.*>< ([^<]*)$/);
            val = val ? val[1] : "";
        }
        return val;
    }
    function aceKeyboardVimLoaded() {
        var cm = _ace.state.cm;
        cm.mode = "normal";
        cm.on('vim-mode-change', function(data) {
            cm.mode = data.mode;
        });
        cm.on('0-register-set', function(data) {
            var lf = document.activeElement;
            Clipboard.write(data.text);
            lf.focus();
        });
        var vim = cm.constructor.Vim;
        vim.defineEx("write", "w", function(cm, input) {
            _save();
        });
        const wq = function(cm, input) {
            self.onExit = _closeAndSave;
            self.exit();
            // tell vim editor that command is done
            _ace.state.cm.signal('vim-command-done', '');
        };
        vim.defineEx("wq", "wq", wq);
        vim.defineEx("x", "x", wq);
        vim.map('<CR>', ':wq<CR>', 'normal');
        vim.defineEx("bnext", "bn", function(cm, input) {
            front.contentCommand({
                action: 'nextEdit',
                backward: false
            });
        });
        vim.defineEx("bprevious", "bp", function(cm, input) {
            front.contentCommand({
                action: 'nextEdit',
                backward: true
            });
        });
        vim.defineEx("quit", "q", function(cm, input) {
            self.onExit = _close;
            self.exit();
            _ace.state.cm.signal('vim-command-done', '');
        });
        front.vimMappings.forEach(function(a) {
            vim.map.apply(vim, a);
        });
        var dk = _ace.getKeyboardHandler().defaultKeymap;
        if (front.vimKeyMap && front.vimKeyMap.length) {
            dk.unshift.apply(dk, front.vimKeyMap);
        }
        return vim;
    }
    function aceKeyboardEmacsLoaded() {
        _ace.$emacsModeHandler.addCommands({
            closeAndSave: {
                exec: function(editor) {
                    self.onExit = _closeAndSave;
                    self.exit();
                },
                readOnly: true
            }
        });
        _ace.$emacsModeHandler.bindKey("C-x C-s", "closeAndSave");
        return _ace.$emacsModeHandler;
    }
    _ace.setTheme("ace/theme/chrome");
    var keybindingsDeferred = new Promise(function(resolve, reject) {
        var aceKeyboardLoaded = aceKeyboardVimLoaded;
        if (runtime.conf.aceKeybindings === "emacs") {
            aceKeyboardLoaded = aceKeyboardEmacsLoaded;
        } else {
            runtime.conf.aceKeybindings = "vim";
        }
        _ace.setKeyboardHandler('ace/keyboard/' + runtime.conf.aceKeybindings, function() {
            resolve(aceKeyboardLoaded());
        });
    });
    _ace.container.style.background = "#f1f1f1";
    _ace.$blockScrolling = Infinity;

    self.show = function(message) {
        keybindingsDeferred.then(function(vim) {
            _ace.setValue(message.content, -1);
            originValue = message.content;
            _ace.container.querySelector('textarea').focus();
            self.enter();
            _editorType = message.type;
            _ace.setFontSize(16);

            if (vim.$id === "ace/keyboard/emacs") {
                if (message.type === 'url') {
                    _ace.setOption('showLineNumbers', false);
                    _ace.language_tools.setCompleters([createUrlCompleter()]);
                    _ace.container.style.height = "30%";
                } else if (message.type === 'input') {
                    _ace.setOption('showLineNumbers', false);
                    _ace.language_tools.setCompleters([pageWordCompleter]);
                    _ace.container.style.height = "";
                } else {
                    _ace.setOption('showLineNumbers', true);
                    _ace.language_tools.setCompleters([pageWordCompleter]);
                    _ace.container.style.height = "30%";
                }
                _ace.setReadOnly(message.type === 'select');

                // reset undo
                setTimeout( function () {
                    _ace.renderer.session.$undoManager.reset();
                }, 1);
            } else {
                vim.unmap('<CR>', 'insert');
                vim.unmap('<C-CR>', 'insert');
                if (message.type === 'url') {
                    vim.map('<CR>', '<Esc>:wq<CR>', 'insert');
                    _ace.setOption('showLineNumbers', false);
                    _ace.language_tools.setCompleters([createUrlCompleter()]);
                    _ace.container.style.height = "30%";
                } else if (message.type === 'input') {
                    vim.map('<CR>', '<Esc>:wq<CR>', 'insert');
                    _ace.setOption('showLineNumbers', false);
                    _ace.language_tools.setCompleters([pageWordCompleter]);
                    _ace.container.style.height = "16px";
                } else {
                    vim.map('<C-CR>', '<Esc>:wq<CR>', 'insert');
                    _ace.setOption('showLineNumbers', true);
                    _ace.language_tools.setCompleters([pageWordCompleter]);
                    _ace.container.style.height = "30%";
                }
                _ace.setReadOnly(message.type === 'select');
                vim.map('<C-d>', '<C-w>', 'insert');
                vim.exitInsertMode(_ace.state.cm);

                // set cursor at initial line
                _ace.state.cm.setCursor(message.initial_line, 0);
                _ace.state.cm.ace.renderer.scrollCursorIntoView();
                // reset undo
                setTimeout( function () {
                    _ace.renderer.session.$undoManager.reset();
                }, 1);

                _ace.state.cm.ace.setOption('indentedSoftWrap', false);
                _ace.state.cm.ace.setOption('wrap', true);
            }
        });
    };

    return self;
}
