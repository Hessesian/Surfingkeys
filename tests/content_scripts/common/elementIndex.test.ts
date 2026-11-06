const SELECTOR = "a, button, [role=button]";
const VIEWPORT = { width: 800, height: 600 };

let idle: Array<(d: { timeRemaining(): number }) => void> = [];
let observed: Set<Element>;
let ioCallback: (entries: Array<{ target: Element; isIntersecting: boolean }>) => void;

(globalThis as any).requestIdleCallback = (cb: (d: { timeRemaining(): number }) => void) => {
    idle.push(cb);
};
(globalThis as any).IntersectionObserver = class {
    constructor(cb: typeof ioCallback) {
        ioCallback = cb;
        observed = new Set();
    }
    observe(e: Element) { observed.add(e); }
    unobserve(e: Element) { observed.delete(e); }
    disconnect() { observed.clear(); }
};

// Required, not imported: the module picks its idle scheduler at load, after the stubs above.
const { startElementIndexWhenIdle, stopElementIndex, visibleCandidates } =
    require("src/content_scripts/common/elementIndex") as typeof import("src/content_scripts/common/elementIndex");

function flushIdle() {
    while (idle.length) {
        idle.shift()!({ timeRemaining: () => 50 });
    }
}

// MutationObserver callbacks are microtasks.
const settle = () => new Promise((r) => setTimeout(r, 0));

// jsdom has no layout: elements marked data-onscreen get an on-screen box.
Element.prototype.getBoundingClientRect = function (this: Element) {
    const on = this.hasAttribute("data-onscreen");
    return { top: on ? 10 : 0, bottom: on ? 30 : 0, left: 0, right: on ? 50 : 0, height: on ? 20 : 0, width: on ? 50 : 0 } as DOMRect;
};

function intersect(...els: Element[]) {
    ioCallback(els.map((target) => ({ target, isIntersecting: true })));
}

function ids(els: Element[] | null) {
    return els && els.map((e) => e.id);
}

async function readyIndex() {
    startElementIndexWhenIdle(() => SELECTOR);
    flushIdle();
    flushIdle();
    await settle();
}

describe("elementIndex", () => {
    beforeEach(() => {
        stopElementIndex();
        idle = [];
    });

    test("answers null until the idle scan finishes, then only on-screen candidates", async () => {
        document.body.innerHTML = '<a id="on" data-onscreen href="#"></a><a id="off" href="#"></a><div id="plain" data-onscreen></div>';
        startElementIndexWhenIdle(() => SELECTOR);
        expect(visibleCandidates(SELECTOR, VIEWPORT)).toBeNull();

        flushIdle();
        flushIdle();
        expect([...observed].map((e) => e.id).sort()).toEqual(["off", "on"]);

        intersect(document.getElementById("on")!, document.getElementById("off")!);
        // "off" is inside the intersection margin but not on screen.
        expect(ids(visibleCandidates(SELECTOR, VIEWPORT))).toEqual(["on"]);
    });

    test("an element added just before the press is found without an intersection report", async () => {
        document.body.innerHTML = "<div id=wrap></div>";
        await readyIndex();

        document.getElementById("wrap")!.innerHTML = '<button id="late" data-onscreen></button>';
        await settle();
        expect(ids(visibleCandidates(SELECTOR, VIEWPORT))).toEqual(["late"]);
    });

    test("removed elements leave the index; moved ones stay", async () => {
        document.body.innerHTML = '<div id=a><a id="gone" data-onscreen href="#"></a><a id="moved" data-onscreen href="#"></a></div><div id=b></div>';
        await readyIndex();
        intersect(document.getElementById("gone")!, document.getElementById("moved")!);

        document.getElementById("b")!.appendChild(document.getElementById("moved")!);
        document.getElementById("gone")!.remove();
        await settle();

        expect(ids(visibleCandidates(SELECTOR, VIEWPORT))).toEqual(["moved"]);
        expect([...observed].map((e) => e.id)).toEqual(["moved"]);
    });

    test("an attribute change can make an element a candidate", async () => {
        document.body.innerHTML = '<div id="x" data-onscreen></div>';
        await readyIndex();

        document.getElementById("x")!.setAttribute("role", "button");
        await settle();
        intersect(document.getElementById("x")!);
        expect(ids(visibleCandidates(SELECTOR, VIEWPORT))).toEqual(["x"]);
    });

    test("results come in document order, light DOM before shadow content", async () => {
        document.body.innerHTML = '<div id="host"></div><a id="second" data-onscreen href="#"></a><a id="first" data-onscreen href="#"></a>';
        document.body.insertBefore(document.getElementById("first")!, document.getElementById("second"));
        const shadow = document.getElementById("host")!.attachShadow({ mode: "open" });
        shadow.innerHTML = '<button id="inner" data-onscreen></button>';
        await readyIndex();

        intersect(...observed);
        expect(ids(visibleCandidates(SELECTOR, VIEWPORT))).toEqual(["first", "second", "inner"]);
    });

    test("Surfingkeys' own hint overlay is not indexed", async () => {
        document.body.innerHTML = '<div class="surfingkeys_hints_host"></div>';
        const shadow = document.querySelector(".surfingkeys_hints_host")!.attachShadow({ mode: "open" });
        shadow.innerHTML = '<a id="ours" data-onscreen href="#"></a>';
        await readyIndex();
        shadow.appendChild(document.createElement("button"));
        await settle();
        flushIdle();
        expect(observed.size).toBe(0);
    });

    test("a different selector rebuilds the index and answers null meanwhile", async () => {
        document.body.innerHTML = '<a id="l" data-onscreen href="#"></a>';
        await readyIndex();
        expect(visibleCandidates("button", VIEWPORT)).toBeNull();
        flushIdle();
        expect(visibleCandidates("button", VIEWPORT)).toEqual([]);
    });
});
