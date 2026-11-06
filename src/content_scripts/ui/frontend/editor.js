import { encode } from 'js-base64';
import { RUNTIME } from '../../common/runtime.js';
import { setSanitizedContent } from '../../common/utils.js';
import createAceEditor from './aceEditor.js';

// Hosts the ACE editor and the neovim embed, each loaded the first time it is asked for.
export default function installEditor(self, { normal, showElement }) {
    const _actions = self._actions;
    const _editor = document.getElementById('sk_editor');
    const _nvim = document.getElementById('sk_nvim');
    _actions['addVimMap'] = function (message) {
        self.vimMappings.push([message.lhs, message.rhs, message.ctx]);
    };
    _actions['addVimKeyMap'] = function (message) {
        self.vimKeyMap = message.vimKeyMap;
    };
    self.vimMappings = [];
    let _aceEditor = null;
    function renderAceEditor(message) {
        if (!_aceEditor) {
            _aceEditor = new Promise((resolve, reject) => {
                import(/* webpackIgnore: true */ './ace.js').then(() => {
                    resolve(createAceEditor(normal, self));
                });
            });
        }
        _aceEditor.then((editor) => {
            editor.show(message);
        });
    }
    let _neovim = null;
    function renderNvim(message) {
        if (!_neovim) {
            _neovim  = new Promise((resolve, reject) => {
                import(/* webpackIgnore: true */ './neovim_lib.js').then((nvimlib) => {
                    nvimlib.default(_nvim).then(({nvim, destroy}) => {
                        function quitNvim() {
                            normal.enter();
                            destroy();
                            self.hidePopup();
                        }
                        function rpc(data) {
                            const [ event, args ] = data;
                            if (event === "WriteData") {
                                self.contentCommand({
                                    action: 'ace_editor_saved',
                                    data: args[0].join("\r")
                                });
                                quitNvim();
                            }
                        }
                        nvim.on('nvim:open', () => {
                            nvim.on('surfingkeys:rpc', rpc);
                        });
                        nvim.on('nvim:close', () => {
                            nvim.off('surfingkeys:rpc', rpc);
                            quitNvim();
                        });
                        resolve(nvim);
                    });
                });
            });
        }
        _neovim.then((nvim) => {
            normal.exit();
            RUNTIME('connectNative', {mode: "embed"}, (resp) => {
                nvim.connect(resp.url, () => {
                    nvim.command(`call NewScratch("${message.file_name}", "${encode(message.content)}", "${message.type}")`);
                });
            });
        });
    }
    _actions['showEditor'] = function(message) {
        if (message.onEditorSaved) {
            self.onEditorSaved = message.onEditorSaved;
        }
        if (message.file_name) {
            showElement(_nvim, () => {
                renderNvim(message);
            });
        } else {
            showElement(_editor, () => {
                renderAceEditor(message);
            });
        }
    };
    self.showEditor = _actions['showEditor'];
}
