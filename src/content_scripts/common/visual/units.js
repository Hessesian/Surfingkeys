import { getBrowserName } from "../utils.js";

// Text units the selection can grow by, keyed by the letter used in l/w/s/p mappings.
export const UNITS = {
    w: "word",
    l: "lineboundary",
    s: "sentence",
    p: "paragraphboundary"
};

// Grow the selection by one unit. Firefox cannot do sentence or paragraph.
export function selectUnit(w) {
    if (getBrowserName() !== "Firefox" || (w !== "p" && w !== "s")) {
        var unit = UNITS[w];
        // sentence and paragraphboundary not support in firefox
        // document.getSelection().modify("move", "backward", "paragraphboundary")
        // gets 0x80004001 (NS_ERROR_NOT_IMPLEMENTED)
        document.getSelection().modify("extend", "forward", unit);
    }
}
