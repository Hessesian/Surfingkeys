import {
    listElements,
    isInUIFrame,
    reportIssue,
    isElementDrawn,
} from './utils.js';
import { RUNTIME, dispatchSKEvent, runtime, skEventName } from './runtime.js';
import KeyboardUtils from './keyboardUtils';
import { createModesStore, keysOf } from '../../core/modes';

const modes = createModesStore();
const stack = () => modes.getState().stack;

const Mode = function(name, statusLine) {
    this.name = name;
    this.statusLine = statusLine;
    this.eventListeners = {};
    this.addEventListener = function(evtName, handler) {
        this.eventListeners[evtName] = handler;

        if (!_listenedEvents.hasOwnProperty(evtName)) {
            _listenedEvents[evtName] = function(event) {
                handleStack(evtName, event);
            };
            window.addEventListener(evtName, _listenedEvents[evtName], true);
        }

        return this;
    };

    this.enter = function(priority, reentrant) {
        return dispatch({ type: "enter", mode: this, priority, reentrant: !!reentrant });
    };

    this.exit = function(peek) {
        dispatch({ type: "exit", mode: this, peek: !!peek });
    };
};

// The dispatch position lives in the store; these keep the fields other modules
// still read and reset on the mode object.
Object.defineProperties(Mode.prototype, {
    map_node: {
        get() { return keysOf(modes.getState(), this).node; },
        set(node) { dispatch({ type: "setKeys", mode: this, patch: { node } }); },
    },
    pendingMap: {
        get() { return keysOf(modes.getState(), this).pending; },
        set(pending) { dispatch({ type: "setKeys", mode: this, patch: { pending: pending || null } }); },
    },
    repeats: {
        get() { return keysOf(modes.getState(), this).repeats; },
        set(repeats) { dispatch({ type: "setKeys", mode: this, patch: { repeats } }); },
    },
    priority: {
        get() { return modes.getState().priority.get(this); },
        set(priority) { dispatch({ type: "setPriority", mode: this, priority }); },
    },
});

function dispatch(msg) {
    const { effects, reply } = modes.dispatch(msg);
    for (const effect of effects) {
        runEffect(effect);
    }
    return reply;
}

function runEffect(effect, onNoMatched) {
    const mode = effect.mode;
    switch (effect.type) {
        case "reportDuplicate":
            reportIssue("Mode {0} pushed into mode stack again.".format(mode.name), "Modes in stack: {0}".format(effect.stack.map((m) => m.name).join(",")));
            return;
        case "onEnter":
            mode.onEnter && mode.onEnter();
            return;
        case "onExit":
            mode.onExit && mode.onExit(effect.pos);
            return;
        case "showStatus":
            Mode.showStatus();
            return;
        case "key":
            return runKeyEffect(mode, effect.effect, onNoMatched);
    }
}

Mode.getCurrent = () => {
    return stack()[0];
};

Mode.specialKeys = {
    "<Alt-s>": ["<Alt-s>"],       // hotkey to toggleBlocklist
    "<Esc>": ["<Esc>"]
};

Mode.isSpecialKeyOf = function(specialKey, keyToCheck) {
    return (-1 !== Mode.specialKeys[specialKey].indexOf(KeyboardUtils.decodeKeystroke(keyToCheck)));
};

// Enable to stop propagation of the event whose keydown handler has been triggered
// Why we need this?
// For example, there is keyup event handler of `s` on some site to set focus on an input box,
// Now user presses `sg` to search with google, Surfingkeys got `s` and triggered its keydown handler.
// But keyup handler of the site also got triggered, then `g` was swallowed by the input box.
// This setting now is only turned on for Normal.
// For Hints, we could not turn on it, as keyup should be propagated to Normal
// to stop scrolling when holding a key.
var keysNeedKeyupSuppressed = [];
Mode.suppressKeyUp = function(keyCode) {
    if (keysNeedKeyupSuppressed.indexOf(keyCode) === -1) {
        keysNeedKeyupSuppressed.push(keyCode);
    }
};

function onAfterHandler(mode, event) {
    if (event.sk_stopPropagation) {
        event.stopImmediatePropagation();
        event.preventDefault();
    }
}

function handleStack(eventName, event, cb) {
    for (var i = 0; i < stack().length && !event.sk_stopPropagation; i++) {
        var m = stack()[i];
        if (!event.sk_suppressed && m.eventListeners.hasOwnProperty(eventName)) {
            var handler = m.eventListeners[eventName];
            handler(event);
            onAfterHandler(m, event);
        }
        if (m.name === "Disabled") {
            break;
        }
        cb && cb(m);
    }
}

let eventListenerBeats = 0;
var suppressScrollEvent = 0, _listenedEvents = {
    "sentinel": (event) => {
        eventListenerBeats ++;
    },
    "keydown": function (event) {
        event.sk_keyName = KeyboardUtils.getKeyChar(event);
        if (stack().length === 0 && window !== top) {
            // automatically boots iframe on demand
            dispatchSKEvent('iframeBoot');
            document.addEventListener(skEventName("userSettingsLoaded"), () => {
                // proceed to handle the key event after userSettingsLoaded.
                handleStack("keydown", event);
            }, {once: true});
            return;
        }
        handleStack("keydown", event);
    },
    "keyup": function (event) {
        handleStack("keyup", event, function (m) {
            var i = keysNeedKeyupSuppressed.indexOf(event.keyCode);
            if (i !== -1) {
                event.stopImmediatePropagation();
                keysNeedKeyupSuppressed.splice(i, 1);
            }
        });
    },
    "scroll": function (event) {
        handleStack("scroll", event);
        if (suppressScrollEvent > 0) {
            event.stopImmediatePropagation();
            event.preventDefault();
            suppressScrollEvent--;
        }
    }
};

function init(cb) {
    dispatch({ type: "reset" });
    for (var evtName in _listenedEvents) {
        window.addEventListener(evtName, _listenedEvents[evtName], true);
    }
    cb && cb();
}

Mode.hasScroll = function (el, direction, barSize) {
    const style = window.getComputedStyle(el);
    if (!style) {
        return false;
    }
    const overflow = (direction === 'y') ? style.overflowY : style.overflowX;
    if (!['auto', 'scroll', 'overlay'].includes(overflow)) {
        return false;
    }

    var offset = (direction === 'y') ? ['scrollTop', 'height'] : ['scrollLeft', 'width'];
    var result = el[offset[0]];

    if (result < barSize) {
        // set scroll offset to barSize, and verify if we can get scroll offset as barSize
        var originOffset = el[offset[0]];
        el[offset[0]] = el.getBoundingClientRect()[offset[1]];
        result = el[offset[0]];
        if (result !== originOffset) {
            // this is valid for some site such as http://mail.live.com/
            suppressScrollEvent++;
        }
        el[offset[0]] = originOffset;
    }
    return result >= barSize;
};

function isScrollableContainer(n) {
    return isElementDrawn(n) && ((Mode.hasScroll(n, 'y', 16) && n.scrollHeight > 200) || (Mode.hasScroll(n, 'x', 16) && n.scrollWidth > 200));
}

function getScrollableElementsByFullScan() {
    var nodes = listElements(document.body, NodeFilter.SHOW_ELEMENT, isScrollableContainer);
    nodes.sort(function(a, b) {
        if (b.contains(a)) return 1;
        else if (a.contains(b)) return -1;
        return b.scrollHeight * b.scrollWidth - a.scrollHeight * a.scrollWidth;
    });
    return nodes;
}

function unshiftScrollingElementIfNeeded(nodes) {
    // document.scrollingElement will be null when document.body.tagName === "FRAMESET", for example http://www.knoppix.org/
    if (document.scrollingElement && (document.scrollingElement.scrollHeight > window.innerHeight
        || document.scrollingElement.scrollWidth > window.innerWidth)) {
        nodes.unshift(document.scrollingElement);
    }
    return nodes;
}

Mode.getScrollableElements = function () {
    var nodes = [];
    var node = document.elementFromPoint(window.innerWidth / 2, window.innerHeight / 2);
    while (node) {
        if (isScrollableContainer(node)) {
            nodes.push(node);
        }
        if (node === document.body) {
            break;
        }
        node = node.parentElement;
    }

    if (nodes.length === 0) {
        nodes = getScrollableElementsByFullScan();
    }

    return unshiftScrollingElementIfNeeded(nodes);
};

/**
 * Find every scrollable container in the document (not just ones near the
 * viewport center), for callers that need to enumerate all scrollable
 * regions — e.g. cycling through them. Slower than `getScrollableElements`
 * since it always does the full-document scan; use that instead when you
 * only need a default scroll target.
 */
Mode.getAllScrollableElements = function () {
    return unshiftScrollingElementIfNeeded(getScrollableElementsByFullScan());
};

Mode.init = (cb)=> {
    // For blank page in frames, we defer init to page loaded
    // as document.write will clear added eventListeners.
    if (window.location.href === "about:blank" && window.frameElement &&
        (!document.body || document.body.childElementCount === 0)) {
        window.frameElement.addEventListener("load", function(evt) {
            try {
                init(cb);
            } catch (e) {
                console.log("Error on blank iframe loaded: " + e);
            }
        });
    } else {
        init(cb);
    }
};


Mode.showStatus = function() {
    if (document.hasFocus() && stack().length) {
        var cm = stack()[0];
        var sl = cm.statusLine || (runtime.conf.showModeStatus ? cm.name : "");
        if (sl !== "" && window !== top && !isInUIFrame()) {
            var pathname = window.location.pathname.split('/');
            if (pathname.length) {
                sl += " - frame: " + pathname[pathname.length - 1];
            }
        }
        dispatchSKEvent("front", ['showStatus', [sl]]);
    }
};

Mode.finish = function (mode) {
    return dispatch({ type: "finish", mode, root: mode.mappings, trusted: !!mode.isTrustedEvent });
};

function repeatCode(code) {
    while (RUNTIME.repeats > 0) {
        code();
        RUNTIME.repeats--;
    }
}

function runKeyEffect(mode, effect, onNoMatched) {
    switch (effect.type) {
        case "showKeystroke":
            dispatchSKEvent("front", ['showKeystroke', effect.key, mode]);
            return;
        case "hideKeystroke":
            dispatchSKEvent("front", ['hideKeystroke']);
            return;
        case "setLastKeys":
            mode.setLastKeys && mode.setLastKeys(effect.word);
            return;
        case "noMatch":
            onNoMatched && onNoMatched(effect.last);
            return;
        case "callPending":
            effect.code.call(mode, effect.key);
            return;
        case "run":
            // Mapping code may lower RUNTIME.repeats to stop its own repetition.
            RUNTIME.repeats = effect.times;
            repeatCode(effect.code);
            return;
        case "confirmRun":
            RUNTIME.repeats = effect.times;
            dispatchSKEvent("front", ['showDialog', `Do you really want to repeat this action (${effect.annotation}) ${effect.times} times?`, () => {
                repeatCode(effect.code);
            }]);
            return;
        case "finish":
            return Mode.finish(mode);
    }
}

Mode.handleMapKey = function(event, onNoMatched) {
    var key = event.sk_keyName;
    this.isTrustedEvent = this.__trust_all_events__ || event.isTrusted;

    var isEscKey = Mode.isSpecialKeyOf("<Esc>", key);
    if (isEscKey) {
        key = KeyboardUtils.encodeKeystroke("<Esc>");
    }

    const input = {
        key,
        isEsc: isEscKey,
        trusted: !!this.isTrustedEvent,
        root: this.mappings,
        digitForRepeat: !!runtime.conf.digitForRepeat,
        repeatThreshold: runtime.conf.repeatThreshold,
    };
    const { effects, reply } = modes.dispatch({ type: "key", mode: this, input });
    // The event's flags are set before the mapping runs, as the mapping may read them.
    if (reply.stopPropagation !== undefined) {
        event.sk_stopPropagation = reply.stopPropagation;
    }
    if (reply.suppressed !== undefined) {
        event.sk_suppressed = reply.suppressed;
    }
    let finished = false;
    for (const effect of effects) {
        const ret = runEffect(effect, onNoMatched);
        if (effect.effect.type === "finish") {
            finished = ret;
        }
    }
    return reply.done === "finish" ? finished : reply.done;
};

Mode.checkEventListener = (onMissing) => {
    const previousState = eventListenerBeats;
    window.dispatchEvent(new CustomEvent("sentinel"))
    if (previousState === eventListenerBeats) {
        init();
        onMissing();
    }
};

export default Mode;
