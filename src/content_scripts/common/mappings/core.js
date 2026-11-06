import { RUNTIME, runtime } from '../runtime.js';
import KeyboardUtils from '../keyboardUtils';
import {
    getBrowserName,
    getCssSelectorsOfEditable,
    getLargeElements,
    getRealEdit,
    getWordUnderCursor,
    htmlEncode,
    showBanner,
    showPopup,
    tabOpenLink,
    toggleQuote,
} from '../utils.js';

export default function register({ api, clipboard, insert, hints, visual, front }) {
    const {
        mapkey,
        imapkey,
    } = api;

    mapkey('[[', '#1Click on the previous link on current page', hints.previousPage);
    mapkey(']]', '#1Click on the next link on current page', hints.nextPage);
    mapkey('T', '#3Choose a tab', function() {
        front.chooseTab();
    });
    mapkey(';G', '#3Group this tab', function() {
        front.groupTab();
    });
    mapkey('?', '#0Show usage', function() {
        front.showUsage();
    });
    mapkey('Q', '#8Open omnibar for word translation', function() {
        front.openOmniquery({query: getWordUnderCursor(), style: "opacity: 0.8;"});
    });
    imapkey("<Ctrl-'>", '#15Toggle quotes in an input element', toggleQuote);
    function openVim(useNeovim) {
        var element = getRealEdit();
        element.blur();
        insert.exit();
        front.showEditor(element, null, null, useNeovim);
    }
    imapkey('<Ctrl-i>', '#15Open vim editor for current input', function() {
        openVim(false);
    });
    const browserName = getBrowserName();
    // Neovim is built for everything but Safari, so the mappings are gated the same
    // way: offered without pages/neovim_lib.js they open an editor that never loads.
    if (!browserName.startsWith("Safari")) {
        imapkey('<Ctrl-Alt-i>', '#15Open neovim for current input', function() {
            openVim(true);
        });
        mapkey(';v', '#11Open neovim', function() {
            tabOpenLink("/pages/neovim.html");
        });
    }
    if (browserName === "Chrome") {
        mapkey(';s', 'Toggle PDF viewer from SurfingKeys', function() {
            var pdfUrl = window.location.href;
            if (pdfUrl.indexOf(chrome.runtime.getURL("/pages/pdf_viewer.html")) === 0) {
                const filePos = window.location.search.indexOf("=") + 1;
                pdfUrl = window.location.search.substr(filePos);
                RUNTIME('updateSettings', {
                    settings: {
                        "noPdfViewer": 1
                    }
                }, (resp) => {
                    window.location.replace(pdfUrl);
                });
            } else {
                if (document.querySelector("EMBED") && document.querySelector("EMBED").getAttribute("type") === "application/pdf") {
                    RUNTIME('updateSettings', {
                        settings: {
                            "noPdfViewer": 0
                        }
                    }, (resp) => {
                        window.location.replace(pdfUrl);
                    });
                } else {
                    RUNTIME('getSettings', {
                        key: 'noPdfViewer'
                    }, function(resp) {
                        const info = resp.settings.noPdfViewer ? "PDF viewer enabled." : "PDF viewer disabled.";
                        RUNTIME('updateSettings', {
                            settings: {
                                "noPdfViewer": !resp.settings.noPdfViewer
                            }
                        }, (r) => {
                            showBanner(info);
                        });
                    });
                }
            }
        });
    }

    mapkey(";ql", '#0Show last action', function() {
        showPopup(htmlEncode(runtime.conf.lastKeys.map(function(k) {
            return KeyboardUtils.decodeKeystroke(k);
        }).join(' → ')));
    }, {repeatIgnore: true});

    mapkey('gi', '#1Go to the first edit box', function() {
        hints.createInputLayer();
    });
    mapkey('i', '#1Go to edit box', function() {
        hints.create(getCssSelectorsOfEditable(), hints.dispatchMouseClick);
    });
    mapkey('I', '#1Go to edit box with vim editor', function() {
        hints.create(getCssSelectorsOfEditable(), function(element) {
            front.showEditor(element);
        });
    });
    mapkey('gL', '#1Enter regional Hints mode', function() {
        hints.create(getLargeElements(), (e) => { }, { regionalHints: true });
    });

    mapkey('zv', '#9Enter visual mode, and select whole element', function() {
        visual.toggle("z");
    });
    mapkey('yv', '#7Yank text of an element', function() {
        hints.create(runtime.conf.textAnchorPat, function (element) {
            clipboard.write(element[1] === 0 ? element[0].data.trim() : element[2].trim());
        });
    });
    mapkey('ymv', '#7Yank text of multiple elements', function() {
        var textToYank = [];
        hints.create(runtime.conf.textAnchorPat, function (element) {
            textToYank.push(element[1] === 0 ? element[0].data.trim() : element[2].trim());
            clipboard.write(textToYank.join('\n'));
        }, { multipleHits: true });
    });
}
