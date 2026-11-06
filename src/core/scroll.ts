// Scroll commands as data: how far each one moves a scroll target, from the target's
// measurements alone. The DOM side (which element, animation) lives in scroller.js.

export type ScrollType =
    | "down" | "up" | "pageDown" | "fullPageDown" | "pageUp" | "fullPageUp"
    | "top" | "bottom" | "byRatio" | "left" | "right" | "leftmost" | "rightmost";

export const DIRECTION: Readonly<Record<ScrollType, "vertical" | "horizontal">> = {
    down: "vertical", up: "vertical", pageDown: "vertical", fullPageDown: "vertical",
    pageUp: "vertical", fullPageUp: "vertical", top: "vertical", bottom: "vertical",
    byRatio: "vertical", left: "horizontal", right: "horizontal",
    leftmost: "horizontal", rightmost: "horizontal",
};

export type Metrics = {
    readonly scrollTop: number;
    readonly scrollLeft: number;
    readonly scrollHeight: number;
    readonly scrollWidth: number;
    // The visible size: the window for the page, the box for an element.
    readonly width: number;
    readonly height: number;
};

// [x, y] for one command. `repeats` multiplies relative moves; for byRatio it is the
// percentage to go to, and absolute moves ignore it.
export function scrollDelta(type: ScrollType, m: Metrics, step: number, repeats: number): [number, number] {
    const times = repeats > 1 ? repeats : 1;
    const rel = (x: number, y: number): [number, number] => [x * times, y * times];
    switch (type) {
        case "down": return rel(0, step);
        case "up": return rel(0, -step);
        case "pageDown": return rel(0, Math.round(m.height / 2));
        case "fullPageDown": return rel(0, m.height);
        case "pageUp": return rel(0, -Math.round(m.height / 2));
        case "fullPageUp": return rel(0, -m.height);
        case "top": return rel(0, -m.scrollTop);
        case "bottom": return rel(m.scrollLeft, m.scrollHeight - m.scrollTop);
        case "left": return rel(-Math.round(step / 2), 0);
        case "right": return rel(Math.round(step / 2), 0);
        case "leftmost": return rel(-m.scrollLeft - 10, 0);
        case "rightmost": return rel(m.scrollWidth - m.scrollLeft - m.width + 20, 0);
        case "byRatio": return [0, Math.trunc(repeats * m.scrollHeight / 100) - m.height / 2 - m.scrollTop];
    }
}

// Which page edge a vertical move would push against, for smartPageBoundary.
export function boundaryHit(scrollTop: number, scrollHeight: number, clientHeight: number, y: number): "top" | "bottom" | null {
    if (scrollTop === 0 && y < 0) return "top";
    if (scrollHeight - scrollTop <= clientHeight + 1 && y > 0) return "bottom";
    return null;
}

export function smoothDuration(x: number, y: number): number {
    return Math.max(100, 20 * Math.log(Math.abs(x || y)));
}

// A scroll position kept within [0, max]; `hit` when it had to be clamped.
export function clampScroll(value: number, max: number, increasing: boolean): { value: number; hit: boolean } {
    return value >= 0 && value <= max ? { value, hit: false } : { value: increasing ? max : 0, hit: true };
}
