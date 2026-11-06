import DOMPurify from "dompurify";
import { getRealRect } from './filtering.js';

function dispatchMouseEvent(element, events, modifiers) {
    events.forEach(function(eventName) {
        const event = new MouseEvent(eventName, {
            bubbles: true,
            cancelable: true,
            composed: true,
            view: window,
            ctrlKey: modifiers.ctrlKey,
            altKey: modifiers.altKey,
            shiftKey: modifiers.shiftKey,
            metaKey: modifiers.metaKey
        });
        element.dispatchEvent(event);
    });
}

function setSanitizedContent(elm, str) {
    elm.innerHTML = DOMPurify.sanitize(str);
}

function createElementWithContent(tag, content, attributes) {
    var elm = document.createElement(tag);
    if (content) {
        setSanitizedContent(elm, content);
    }

    if (attributes) {
        for (var attr in attributes) {
            elm.setAttribute(attr, attributes[attr]);
        }
    }

    return elm;
}

var _divForHtmlEncoder = document.createElement("div");
function htmlEncode(str) {
    _divForHtmlEncoder.innerText = str;
    return _divForHtmlEncoder.innerHTML;
}

HTMLElement.prototype.one = function (evt, handler) {
    function _onceHandler() {
        handler.call(this);
        this.removeEventListener(evt, _onceHandler);
    }
    this.addEventListener(evt, _onceHandler);
};

HTMLElement.prototype.show = function () {
    this.style.display = "";
};

HTMLElement.prototype.hide = function () {
    this.style.display = "none";
};

HTMLElement.prototype.removeAttributes = function () {
    while (this.attributes.length > 0) {
        this.removeAttribute(this.attributes[0].name);
    }
};

HTMLElement.prototype.containsWithShadow = function (e) {
    const roots = [this];
    while (roots.length) {
        const root = roots.shift();
        if (root.contains(e)) {
            return true;
        }
        roots.push(...root.children);
        if (root.shadowRoot) {
            if (root.shadowRoot.contains(e)) {
                return true;
            }
            roots.push(...root.shadowRoot.children);
        }
    }
    return false;
};

NodeList.prototype.remove = function() {
    this.forEach(function(node) {
        node.remove();
    });
};

NodeList.prototype.show = function() {
    this.forEach(function(node) {
        node.show();
    });
};

NodeList.prototype.hide = function() {
    this.forEach(function(node) {
        node.hide();
    });
};

const flashElem = createElementWithContent('div', '', {style: "position: fixed; box-shadow: 0px 0px 4px 2px #63b2ff; background: transparent; z-index: 2140000000"});
function flashPressedLink(link, cb) {
    var rect = getRealRect(link);
    flashElem.style.left = rect.left + 'px';
    flashElem.style.top = rect.top + 'px';
    flashElem.style.width = rect.width + 'px';
    flashElem.style.height = rect.height + 'px';
    document.body.appendChild(flashElem);

    setTimeout(() => {
        flashElem.remove();
        cb();
    }, 100);
}

export {
    dispatchMouseEvent,
    setSanitizedContent,
    createElementWithContent,
    htmlEncode,
    flashPressedLink,
};
