import { isElementDrawn } from '../utils.js';

// The hints live in a host element; a modal <dialog> sits in the top layer above
// anything else in the page, so the host has to be inside it to be seen.
export default
function placeHintsHost(host) {
    let topLayerElement = document.querySelector("dialog[open]");
    if (!topLayerElement || !isElementDrawn(topLayerElement)) {
        topLayerElement = document.documentElement;
    }
    topLayerElement.appendChild(host);
}
