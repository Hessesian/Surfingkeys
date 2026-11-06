import Trie from './trie';
import { RUNTIME, dispatchSKEvent, runtime } from './runtime.js';
import Mode from './mode';
import createScroller from './scroller';
import KeyboardUtils from './keyboardUtils';
import {
    getRealEdit,
    initSKFunctionListener,
    isEditable,
    isElementClickable,
    isElementPartiallyInViewport,
    isInUIFrame,
    mapInMode,
    setSanitizedContent,
    showBanner,
    showPopup,
} from './utils.js';

function createDisabled(normal) {
    const self = new Mode("Disabled");

    // hide status line for Disabled mode
    self.statusLine = "";

    // Disabled has higher priority than others.
    self.priority = 99;

    self.activatedOnElement = false;
    self.addEventListener('keydown', function(event) {
        // prevent this event to be handled by Surfingkeys' other listeners
        event.sk_suppressed = true;
        if (self.activatedOnElement && !document.activeElement.matches(runtime.conf.disabledOnActiveElementPattern)) {
            normal.enable();
            self.activatedOnElement = false;
        } else if (self.disabledElement && document.activeElement !== self.disabledElement) {
            normal.enable();
        } else if (Mode.isSpecialKeyOf("<Alt-s>", event.sk_keyName)) {
            normal.toggleBlocklist();
            self.exit();
            event.sk_stopPropagation = true;
        }
    });

    return self;
}

function createLurk(normal) {
    const self = new Mode("Lurk");

    function enterNormal() {
        normal.enter();
        if (window === top) {
            RUNTIME('setSurfingkeysIcon', {
                status: "enabled"
            });
        }
    }

    self.mappings = new Trie();
    self.map_node = self.mappings;
    self.mappings.add(KeyboardUtils.encodeKeystroke("<Alt-i>"), {
        annotation: "Enter normal mode",
        feature_group: 16,
        code: enterNormal
    });
    self.mappings.add("p", {
        annotation: "Enter ephemeral normal mode to temporarily enable SurfingKeys",
        feature_group: 16,
        code: function() {
            enterNormal();
            setTimeout(() => {
                normal.revertToLurk();
            }, 1000);
        }
    });

    // Lurk and Disabled should be mutually exclusive.
    self.addEventListener('keydown', function(event) {
        var realTarget = getRealEdit(event);
        if (!isEditable(realTarget) && event.sk_keyName.length) {
            Mode.handleMapKey.call(self, event);
            if (event.sk_stopPropagation) {
                // keyup event also needs to be suppressed for the key whose keydown has been suppressed.
                Mode.suppressKeyUp(event.keyCode);
            }
        }
    });
    return self;
}

function createPassThrough() {
    var self = new Mode("PassThrough");
    var _autoExit, _timeout;

    self.addEventListener('keydown', function(event) {
        // prevent this event to be handled by Surfingkeys' other listeners
        event.sk_suppressed = true;
        if (Mode.isSpecialKeyOf("<Esc>", event.sk_keyName)) {
            self.exit();
            event.sk_stopPropagation = true;
        } else if (_timeout > 0) {
            if (_autoExit) {
                clearTimeout(_autoExit);
                _autoExit = undefined;
            }
            _autoExit = setTimeout(function() {
                self.exit();
            }, _timeout);
        }
    }).addEventListener('mousedown', function(event) {
        event.sk_suppressed = true;
    });
    self.addEventListener('focus', function(event) {
        event.sk_suppressed = true;
    });

    self.onEnter = function() {
        if (_timeout > 0) {
            _autoExit = setTimeout(function() {
                self.exit();
            }, _timeout);
            self.statusLine = `ephemeral(${_timeout}ms) pass through`;
        } else {
            self.statusLine = "pass through";
        }
    };

    self.setTimeout = function(timeout) {
        _timeout = timeout;
    };

    return self;
}

function createNormal(insert) {
    var self = new Mode("Normal");

    self.mappings = new Trie();
    self.map_node = self.mappings;

    // let next focus event pass
    var _passFocus = false;
    self.passFocus = function(pf) {
        _passFocus = pf;
    };

    let _lurk = undefined;
    self.startLurk = () => {
        let state = "lurking";
        if (!_lurk) {
            self.exit();
            _lurk = createLurk(self);
            _lurkMaps.forEach((keymap) => {
                mapInMode(_lurk, keymap[0], keymap[1]);
                _lurk.mappings.remove(KeyboardUtils.encodeKeystroke(keymap[1]));
            });
            _lurkMaps = undefined;
            _lurk.enter(0, true);
        } else if (Mode.getCurrent() !== _lurk) {
            state = "enabled";
        }
        return state;
    };
    self.revertToLurk = () => {
        // peeking exit to keep modes such hints above normal.
        self.exit(true);
        if (window === top) {
            RUNTIME('setSurfingkeysIcon', {
                status: "lurking"
            });
        }
    };
    self.getLurkMode = () => {
        return _lurk;
    };
    let _lurkMaps = [];
    self.addLurkMap = (new_keystroke, old_keystroke) => {
        _lurkMaps.push([new_keystroke, old_keystroke]);
    };

    var _once = false;
    self.addEventListener('keydown', function(event) {
        var realTarget = getRealEdit(event);
        if (isEditable(realTarget) && event.isTrusted) {
            if (Mode.isSpecialKeyOf("<Esc>", event.sk_keyName)) {
                realTarget.blur();
                insert.exit();
            } else {
                if (runtime.conf.editableBodyCare && realTarget === document.body && event.key !== "i") {
                    self.statusLine = "Press i to enter Insert mode";
                    runtime.conf.showModeStatus = true;
                    if (event.sk_keyName.length) {
                        Mode.handleMapKey.call(self, event);
                    }
                } else {
                    event.sk_stopPropagation = (runtime.conf.editableBodyCare
                        && realTarget === document.body && event.key === "i");
                    if (event.sk_stopPropagation) {
                        self.passFocus(true);
                        realTarget.focus();
                    }

                    var stealFocus = false;
                    if (!isElementPartiallyInViewport(realTarget)) {
                        var n = realTarget;
                        while (n !== document.documentElement && !n.newlyCreated) {
                            n = n.parentElement;
                        }
                        stealFocus = n !== document.documentElement && n.newlyCreated;
                    }
                    if (stealFocus) {
                        // steal focus from dynamically created input widget
                        realTarget.blur();
                        delete n.newlyCreated;
                        Mode.handleMapKey.call(self, event);
                    } else {
                        // keep cursor where it is
                        insert.enter(realTarget, true);
                    }

                }
            }
        } else if (Mode.isSpecialKeyOf("<Alt-s>", event.sk_keyName)) {
            self.toggleBlocklist();
            Mode.finish(self);
            event.sk_stopPropagation = true;
        } else if (event.sk_keyName.length) {
            var done = Mode.handleMapKey.call(self, event, () => {
                // revert to lurk only when Esc is not handled and lurk mode available.
                if (Mode.isSpecialKeyOf("<Esc>", event.sk_keyName) && _lurk) {
                    self.revertToLurk();
                }
            });
            if (_once && done) {
                _once = false;
                self.exit();
            }
        }
        if (event.sk_stopPropagation) {
            // keyup event also needs to be suppressed for the key whose keydown has been suppressed.
            Mode.suppressKeyUp(event.keyCode);
        }
    });
    self.addEventListener('blur', function(event) {
        scroller.release();
    });
    var _inFocusHandler = false;
    self.addEventListener('focus', function(event) {
        if (_inFocusHandler) return;
        _inFocusHandler = true;
        Mode.showStatus();
        if (runtime.conf.stealFocusOnLoad && !isInUIFrame()) {
            var elm = getRealEdit(event);
            if (isEditable(elm)) {
                if (_passFocus || elm.enableAutoFocus) {
                    if (!runtime.conf.enableAutoFocus) {
                        // prevent focus on input only when enableAutoFocus is turned off.
                        _passFocus = false;
                    }
                } else {
                    elm.blur();
                    event.sk_stopPropagation = true;
                }
            }
        }
        _inFocusHandler = false;
    });
    self.addEventListener('keyup', function(event) {
        setTimeout(scroller.release, 0);
    });
    self.addEventListener('mousedown', function(event) {
        // The isTrusted read-only property of the Event interface is a boolean
        // that is true when the event was generated by a user action, and false
        // when the event was created or modified by a script or dispatched via dispatchEvent.

        // enable only mouse click from human being to focus input
        if (runtime.conf.enableAutoFocus) {
            self.passFocus(true);
        } else {
            self.passFocus(event.isTrusted);
        }

        var realTarget = getRealEdit(event);
        if (isEditable(realTarget)) {
            // keep cursor where it is
            insert.enter(realTarget, true);
        } else {
            insert.exit();
        }

        if (document.activeElement.matches(runtime.conf.disabledOnActiveElementPattern)) {
            setTimeout(() => {
                self.disable(true);
            }, 100);
        }
    });

    self.toggleBlocklist = function() {
        if (document.location.href.indexOf(chrome.runtime.getURL("/")) !== 0) {
            RUNTIME('toggleBlocklist', {
                blocklistPattern: (runtime.conf.blocklistPattern ? runtime.conf.blocklistPattern : "")
            }, function(resp) {
                if (resp.state === "disabled") {
                    if (resp.blocklist.hasOwnProperty(".*")) {
                        showBanner('Surfingkeys is globally disabled, please enable it globally from popup menu.', 3000);
                    } else {
                        showBanner('Surfingkeys turned OFF for ' + resp.url, 3000);
                    }
                } else {
                    showBanner('Surfingkeys turned ON for ' + resp.url, 3000);
                }
            });
        } else {
            showBanner('You could not toggle Surfingkeys on its own pages.', 3000);
        }
    };

    const _passThrough = createPassThrough();
    /**
     * Enter PassThrough mode.
     *
     * @param {number} [timeout] how many milliseconds to linger in PassThrough mode, to ignore it will stay in PassThrough mode until an Escape key is pressed.
     * @name Normal.passThrough
     *
     */
    self.passThrough = function(timeout) {
        _passThrough.setTimeout(timeout);
        _passThrough.enter();
        return _passThrough;
    };
    self.once = () => {
        _once = true;
        self.enter();
    };
    self.mappings.add(KeyboardUtils.encodeKeystroke("<Alt-i>"), {
        annotation: "Enter PassThrough mode to temporarily suppress SurfingKeys",
        feature_group: 0,
        code: function() {
            self.passThrough();
        }
    });
    self.mappings.add("p", {
        annotation: "Enter ephemeral PassThrough mode to temporarily suppress SurfingKeys",
        feature_group: 0,
        code: function() {
            self.passThrough(1000);
        }
    });

    self.repeats = "";
    var lastKeys;
    const scroller = createScroller((elm) => self.highlightElement(elm));

    self.highlightElement = function(elm) {
        var rc;
        if (document.scrollingElement === elm) {
            rc = {
                top: 0,
                left: 0,
                width: window.innerWidth,
                height: window.innerHeight
            };
        } else {
            rc = elm.getBoundingClientRect();
        }
        dispatchSKEvent("front", ['highlightElement', {
            duration: 200,
            rect: {
                top: rc.top,
                left: rc.left,
                width: rc.width,
                height: rc.height
            }
        }]);
    }
    /**
     * Scroll within current target.
     *
     * @param {string} type down | up | pageDown | fullPageDown | pageUp | fullPageUp | top | bottom | left | right | leftmost | rightmost | byRatio
     * @name Normal.scroll
     *
     */
    self.scroll = scroller.scroll;
    self.refreshScrollableElements = scroller.refresh;
    self.addScrollableElement = scroller.add;

    self.rotateFrame = function() {
        RUNTIME('nextFrame', {
            frameId: window.frameId
        });
    };

    /**
     * Feed keys into Normal mode.
     *
     * @param {string} keys the keys to be fed into Normal mode.
     * @name Normal.feedkeys
     *
     */
    self.feedkeys = function(keys) {
        setTimeout(function() {
            var evt = new Event("keydown");
            for (var i = 0; i < keys.length; i ++) {
                evt.sk_keyName = keys[i];
                Mode.handleMapKey.call(self, evt);
            }
        }, 1);
    };

    self.setLastKeys = function(key) {
        if (!this.map_node.meta.repeatIgnore && key.length > 1) {
            lastKeys = [key];
            saveLastKeys();
        }
    };

    function saveLastKeys() {
        RUNTIME('localData', {
            data: {
                lastKeys: lastKeys
            }
        });
    }

    self.appendKeysForRepeat = function(mode, keys) {
        if (lastKeys && lastKeys.length > 0) {
            // keys for normal mode must be pushed.
            lastKeys.push('{0}\t{1}'.format(mode, keys));
            saveLastKeys();
        }
    };

    self.addVIMark = function(mark, url) {
        url = url || window.location.href;
        var mo = {};
        mo[mark] = {
            url: url,
            scrollLeft: document.scrollingElement.scrollLeft,
            scrollTop: document.scrollingElement.scrollTop
        };
        RUNTIME('addVIMark', {mark: mo});
        showBanner("Mark '{0}' added for: {1}.".format(mark, url));
    };

    /**
     * Jump to a vim-like mark.
     *
     * @param {string} mark a vim-like mark.
     * @name Normal.jumpVIMark
     *
     */
    self.jumpVIMark = function(mark) {
        if (mark === "'") {
            scroller.swapLastPosition();
        } else {
            RUNTIME('jumpVIMark', {
                mark: mark
            });
        }
    };

    self.moveTab = function(pos) {
        RUNTIME('moveTab', {
            position: pos
        });
    };

    self.captureElement = function(elm) {
        RUNTIME('getCaptureSize', null, function(response) {
            var scale = response.width / window.innerWidth;

            elm.scrollTop = 0;
            elm.scrollLeft = 0;
            var lastScrollTop = -1, lastScrollLeft = -1;
            // hide scrollbars
            var overflowY = elm.style.overflowY;
            elm.style.overflowY = "hidden";
            var overflowX = elm.style.overflowX;
            elm.style.overflowX = "hidden";
            // hide borders
            var borderStyle = elm.style.borderStyle;
            elm.style.borderStyle = "none";
            dispatchSKEvent("front", ['toggleStatus', false]);

            var dx = 0, dy = 0, sx, sy, sw, sh, ww, wh, dh = elm.scrollHeight, dw = elm.scrollWidth;
            if (elm === document.scrollingElement) {
                ww = window.innerWidth;
                wh = window.innerHeight;
                sx = 0;
                sy = 0;
            } else {
                var br = elm.getBoundingClientRect();
                // visible rectangle
                var rc = [
                    Math.max(br.left, 0),
                    Math.max(br.top, 0),
                    Math.min(br.right, window.innerWidth),
                    Math.min(br.bottom, window.innerHeight)
                ];
                ww = rc[2] - rc[0];
                wh = rc[3] - rc[1];
                sx = rc[0] * scale;
                sy = rc[1] * scale;
            }
            sw = ww * scale;
            sh = wh * scale;

            var canvas = document.createElement( "canvas" );
            canvas.width = dw * scale;
            canvas.height = dh * scale;
            var ctx = canvas.getContext( "2d" );

            var br = elm.getBoundingClientRect();
            var img = document.createElement( "img" );

            img.onload = function() {
                ctx.drawImage(img, sx, sy, sw, sh, dx, dy, sw, sh);
                if (lastScrollTop === elm.scrollTop) {
                    if (lastScrollLeft === elm.scrollLeft) {
                        // done
                        dispatchSKEvent("front", ['toggleStatus', true]);
                        showPopup("<img src='{0}' />".format(canvas.toDataURL( "image/png" )));
                        // restore overflow
                        elm.style.overflowY = overflowY;
                        elm.style.overflowX = overflowX;
                        // restore borders
                        elm.style.borderStyle = borderStyle;
                    } else {
                        lastScrollTop = -1;
                        elm.scrollTop = 0;
                        dy = 0;
                        lastScrollLeft = elm.scrollLeft;
                        if (elm.scrollLeft + 2 * ww < dw) {
                            elm.scrollLeft += ww;
                            dx += ww * scale;
                        } else {
                            elm.scrollLeft += dw % ww;
                            dx = elm.scrollLeft * scale;
                        }
                        setTimeout(function() {
                            RUNTIME('captureVisibleTab', null, function(response) {
                                img.src = response.dataUrl;
                            });
                        }, 1000);
                    }
                } else {
                    lastScrollTop = elm.scrollTop;
                    if (elm.scrollTop + 2 * wh < dh) {
                        elm.scrollTop += wh;
                        dy += wh * scale;
                    } else {
                        elm.scrollTop += dh % wh;
                        dy = elm.scrollTop * scale;
                    }
                    setTimeout(function() {
                        RUNTIME('captureVisibleTab', null, function(response) {
                            img.src = response.dataUrl;
                        });
                    }, 1000);
                }
            };

            // wait 500 millisecond for keystrokes of Surfingkeys to hide
            setTimeout(function() {
                RUNTIME('captureVisibleTab', null, function(response) {
                    img.src = response.dataUrl;
                });
            }, 500);

        });
    };

    self.mappings.add("yG", {
        annotation: "Capture current full page",
        feature_group: 7,
        code: function() {
            self.captureElement(document.scrollingElement);
        }
    });
    self.mappings.add("yS", {
        annotation: "Capture scrolling element",
        feature_group: 7,
        code: function() {
            self.captureElement(scroller.current());
        }
    });

    self.mappings.add("cS", {
        annotation: "Reset scroll target",
        feature_group: 2,
        code: scroller.reset
    });

    const bindScrollForHints = (action) => {
        const f = self.scroll.bind(self, action);
        // indicate that the key bound with this function is a key to scroll page and can be used to scroll in Hints mode.
        f.isSKScrollInHints = true;
        return f;
    };
    self.isScrollKeyInHints = (key) => {
        const bound = self.mappings[key];
        return bound && bound.meta && bound.meta.code && bound.meta.code.isSKScrollInHints;
    };

    self.mappings.add("u", {
        annotation: "Scroll half page up",
        feature_group: 2,
        repeatIgnore: true,
        code: self.scroll.bind(self, "pageUp")
    });
    self.mappings.add("U", {
        annotation: "Scroll full page up",
        feature_group: 2,
        repeatIgnore: true,
        code: self.scroll.bind(self, "fullPageUp")
    });
    self.mappings.add("d", {
        annotation: "Scroll half page down",
        feature_group: 2,
        repeatIgnore: true,
        code: self.scroll.bind(self, "pageDown")
    });
    self.mappings.add("P", {
        annotation: "Scroll full page down",
        feature_group: 2,
        repeatIgnore: true,
        code: self.scroll.bind(self, "fullPageDown")
    });
    self.mappings.add("gg", {
        annotation: "Scroll to the top of the page",
        feature_group: 2,
        repeatIgnore: true,
        code: self.scroll.bind(self, "top")
    });
    self.mappings.add("G", {
        annotation: "Scroll to the bottom of the page",
        feature_group: 2,
        repeatIgnore: true,
        code: bindScrollForHints("bottom")
    });
    self.mappings.add("j", {
        annotation: "Scroll down",
        feature_group: 2,
        repeatIgnore: true,
        code: bindScrollForHints("down")
    });
    self.mappings.add("k", {
        annotation: "Scroll up",
        feature_group: 2,
        repeatIgnore: true,
        code: bindScrollForHints("up")
    });
    self.mappings.add("h", {
        annotation: "Scroll left",
        feature_group: 2,
        repeatIgnore: true,
        code: bindScrollForHints("left")
    });
    self.mappings.add("l", {
        annotation: "Scroll right",
        feature_group: 2,
        repeatIgnore: true,
        code: bindScrollForHints("right")
    });
    self.mappings.add("0", {
        annotation: "Scroll all the way to the left",
        feature_group: 2,
        repeatIgnore: true,
        code: bindScrollForHints("leftmost")
    });
    self.mappings.add("$", {
        annotation: "Scroll all the way to the right",
        feature_group: 2,
        repeatIgnore: true,
        code: bindScrollForHints("rightmost")
    });
    self.mappings.add("%", {
        annotation: "Scroll to percentage of current page",
        feature_group: 2,
        repeatIgnore: true,
        code: self.scroll.bind(self, "byRatio")
    });
    self.mappings.add("cs", {
        annotation: "Change scroll target",
        feature_group: 2,
        repeatIgnore: true,
        code: () => scroller.next()
    });

    self.mappings.add("/", {
        annotation: "Find in current page",
        feature_group: 9,
        repeatIgnore: true,
        code: function() {
            dispatchSKEvent("front", ['openFinder']);
        }
    });

    self.mappings.add("E", {
        annotation: "Go one tab left",
        feature_group: 3,
        repeatIgnore: true,
        repeatNoThrottling: true,
        code: function() {
            RUNTIME("previousTab");
        }
    });
    self.mappings.add("R", {
        annotation: "Go one tab right",
        feature_group: 3,
        repeatIgnore: true,
        repeatNoThrottling: true,
        code: function() {
            RUNTIME("nextTab");
        }
    });

    function _onMouseUp(event) {
        if (runtime.conf.mouseSelectToQuery.indexOf(window.origin) !== -1
            && !isElementClickable(event.target)
            && !event.target.matches(".cm-matchhighlight")) {
            // perform inline query after 1 ms
            // to avoid calling on selection collapse
            setTimeout(() => {
                dispatchSKEvent("front", ['querySelectedWord']);
            }, 1);
        }
    }

    var _disabled = null;
    self.disable = function(onElement) {
        if (!_disabled) {
            _disabled = createDisabled(self);
            _disabled.enter(0, true);
        }
        _disabled.activatedOnElement = onElement;
        dispatchSKEvent("observer", ['turnOff']);
        document.removeEventListener("mouseup", _onMouseUp);
    };

    initSKFunctionListener("normal", {
        disableOnFocusedElement: () => {
            self.disable();
            _disabled.disabledElement = document.activeElement;
        },
    });

    self.enable = function() {
        if (_disabled) {
            _disabled.exit();
            _disabled = null;
        }
        document.addEventListener("mouseup", _onMouseUp);
    };
    self.enable();

    self.onExit = function() {
        dispatchSKEvent("observer", ['turnOff']);
    };

    return self;
}

export default createNormal;
