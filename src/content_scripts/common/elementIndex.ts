// Keeps the page's hint candidates, and the layout facts needed to find visible text,
// up to date as the DOM changes, so a hint press reads what is already known instead
// of measuring every element in the document.

export type Viewport = { readonly width: number; readonly height: number };

type Deadline = { timeRemaining(): number };

type IndexState =
    | { readonly status: "idle" }
    | { readonly status: "scanning"; readonly selector: string }
    | { readonly status: "ready"; readonly selector: string };

type Work =
    | { readonly kind: "visit"; readonly root: Element | null; readonly elements: ArrayLike<Element>; next: number }
    | { readonly kind: "layout"; readonly element: Element }
    | { readonly kind: "drop"; readonly root: Element };

type Box = { readonly top: number; readonly left: number; readonly bottom: number; readonly right: number };

// Attributes that decide whether an element matches the structural clickable selector,
// plus class and style, which can change layout.
// ponytail: a user clickableSelector keyed on another attribute is only re-evaluated
// when that element is added again; add its attribute here if that matters.
const WATCHED_ATTRIBUTES = ["href", "role", "onclick", "contenteditable", "class", "style"];

const SLICE = 256;
// Shorter child lists are cheaper to walk than to binary-search.
const BISECT_MIN = 32;

// Layout facts, read from computed style during idle time.
const enum Layout {
    // Drawn independently of its parent's box: absolute, fixed or transformed.
    Escapee = 1 << 0,
    // Clips its descendants to its padding box (overflow other than visible, contain: paint).
    Clips = 1 << 1,
    // Its children are not laid out top to bottom in DOM order.
    Disorderly = 1 << 2,
    DisplayNone = 1 << 3,
    DisplayContents = 1 << 4,
    // Containing block for absolute descendants.
    Positioned = 1 << 5,
    // Containing block for fixed descendants too.
    ContainsFixed = 1 << 6,
    Absolute = 1 << 7,
    Fixed = 1 << 8,
}

export function isRectOnScreen(r: DOMRectReadOnly, v: Viewport): boolean {
    return r.top <= v.height && r.bottom >= 0 && r.left <= v.width && r.right >= 0 && r.height > 0;
}

function intersects(r: Box, c: Box): boolean {
    return r.top < c.bottom && r.bottom > c.top && r.left < c.right && r.right > c.left;
}

function intersection(a: Box, b: Box): Box {
    return {
        top: Math.max(a.top, b.top),
        left: Math.max(a.left, b.left),
        bottom: Math.min(a.bottom, b.bottom),
        right: Math.min(a.right, b.right),
    };
}

// Light DOM in document order first, then shadow content: the order the full-document
// scan produced, which filterAncestors relies on to see an ancestor before its descendants.
export function byDocumentOrder(a: Element, b: Element): number {
    if (a === b) {
        return 0;
    }
    const aLight = a.getRootNode() === a.ownerDocument;
    const bLight = b.getRootNode() === b.ownerDocument;
    if (aLight !== bLight) {
        return aLight ? -1 : 1;
    }
    return a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1;
}

function isOwnElement(e: Element): boolean {
    return e.classList.contains("surfingkeys_hints_host");
}

function parentOf(e: Element): Element | null {
    if (e.parentElement) {
        return e.parentElement;
    }
    const root = e.parentNode;
    return root instanceof ShadowRoot ? root.host : null;
}

const requestIdle: (cb: (d: Deadline) => void) => void =
    typeof requestIdleCallback === "function"
        ? (cb) => { requestIdleCallback(cb, { timeout: 2000 }); }
        // Safari has no requestIdleCallback: a short timer with a fixed slice stands in.
        : (cb) => {
            setTimeout(() => {
                const end = performance.now() + 8;
                cb({ timeRemaining: () => Math.max(0, end - performance.now()) });
            }, 50);
        };

const UNBOUNDED: Deadline = { timeRemaining: () => Infinity };

let state: IndexState = { status: "idle" };
let generation = 0;
let scheduled = false;
let queue: Work[] = [];
// Subtrees waiting for a visit, so a class toggled again before the visit adds nothing.
// ponytail: a subtree already covered by a queued ancestor is still queued again.
const queuedRoots = new Set<Element>();
let fresh: Element[] | null = null;
const candidates = new Set<Element>();
const onScreen = new Set<Element>();
let layout = new WeakMap<Element, number>();
// Parents made disorderly by a child (its order, grid placement or being an escapee).
// Never cleared: a stale entry only costs a linear walk of that parent's children.
let disorderlyParents = new WeakSet<Element>();
const escapees = new Set<Element>();
let mutationObserver: MutationObserver | undefined;
let intersectionObserver: IntersectionObserver | undefined;
let resizeTimer: ReturnType<typeof setTimeout> | undefined;

function add(e: Element): void {
    if (!candidates.has(e)) {
        candidates.add(e);
        intersectionObserver!.observe(e);
        fresh?.push(e);
    }
}

function remove(e: Element): void {
    if (candidates.delete(e)) {
        intersectionObserver!.unobserve(e);
        onScreen.delete(e);
    }
}

function recordLayout(e: Element): number {
    const cs = getComputedStyle(e);
    let f = 0;
    const position = cs.position;
    if (position !== "static") {
        f |= Layout.Positioned;
    }
    if (position === "absolute") {
        f |= Layout.Absolute | Layout.Escapee;
    } else if (position === "fixed") {
        f |= Layout.Fixed | Layout.Escapee;
    }
    if (cs.transform !== "none" || cs.translate !== "none" || cs.rotate !== "none" || cs.scale !== "none") {
        f |= Layout.Escapee | Layout.ContainsFixed;
    }
    if (cs.filter !== "none" || cs.perspective !== "none"
        || /paint|layout|strict|content/.test(cs.contain)
        || /transform|filter|perspective/.test(cs.willChange)) {
        f |= Layout.ContainsFixed;
    }
    if (cs.display === "none") {
        f |= Layout.DisplayNone;
    } else if (cs.display === "contents") {
        f |= Layout.DisplayContents;
    }
    // The root and body hand their overflow to the viewport, which already clips.
    if (e !== document.documentElement && e !== document.body
        && (cs.overflowX !== "visible" || cs.overflowY !== "visible" || /paint|strict|content/.test(cs.contain))) {
        f |= Layout.Clips;
    }
    if ((cs.display.endsWith("flex") && (cs.flexDirection === "column-reverse" || cs.flexWrap === "wrap-reverse"))
        || (cs.display.endsWith("grid") && cs.gridAutoFlow.includes("column"))
        || cs.writingMode !== "horizontal-tb") {
        f |= Layout.Disorderly;
    }
    const parent = parentOf(e);
    if (parent && ((f & Layout.Escapee) || cs.order !== "0" || cs.gridRowStart !== "auto" || cs.gridColumnStart !== "auto")) {
        disorderlyParents.add(parent);
    }
    layout.set(e, f);
    if (f & Layout.Escapee) {
        escapees.add(e);
    } else {
        escapees.delete(e);
    }
    return f;
}

function layoutOf(e: Element): number {
    return layout.get(e) ?? recordLayout(e);
}

function observeRoot(root: Document | ShadowRoot): void {
    mutationObserver!.observe(root, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: WATCHED_ATTRIBUTES,
    });
}

function enqueueSubtree(root: Element): void {
    if (queuedRoots.has(root)) {
        return;
    }
    queuedRoots.add(root);
    // ponytail: one querySelectorAll per added subtree is a single unbudgeted call;
    // fine up to hundreds of thousands of nodes, walk it lazily if that ever shows up.
    queue.push({ kind: "visit", root, elements: [root, ...root.querySelectorAll("*")], next: 0 });
}

function visit(e: Element, selector: string): void {
    if (!e.isConnected || isOwnElement(e)) {
        return;
    }
    if (e.matches(selector)) {
        add(e);
    }
    recordLayout(e);
    // ponytail: a shadow root attached after its host was visited is never seen.
    if (e.shadowRoot) {
        observeRoot(e.shadowRoot);
        queue.push({ kind: "visit", root: null, elements: e.shadowRoot.querySelectorAll("*"), next: 0 });
    }
}

function drop(root: Element, selector: string): void {
    // A moved node is removed and re-added in one batch; only a node still out of the
    // document has really gone.
    if (root.isConnected) {
        return;
    }
    remove(root);
    for (const e of root.querySelectorAll(selector)) {
        remove(e);
    }
}

function work(deadline: Deadline, gen: number, selector: string): void {
    if (gen !== generation) {
        return;
    }
    while (queue.length && deadline.timeRemaining() > 1) {
        const w = queue[0];
        if (w.kind === "drop") {
            queue.shift();
            drop(w.root, selector);
            continue;
        }
        if (w.kind === "layout") {
            queue.shift();
            if (w.element.isConnected) {
                recordLayout(w.element);
            }
            continue;
        }
        const end = Math.min(w.elements.length, w.next + SLICE);
        for (; w.next < end; w.next++) {
            visit(w.elements[w.next], selector);
        }
        if (w.next >= w.elements.length) {
            queue.shift();
            if (w.root) {
                queuedRoots.delete(w.root);
            }
        }
    }
    if (queue.length) {
        requestIdle((d) => work(d, gen, selector));
        return;
    }
    scheduled = false;
    if (state.status === "scanning") {
        state = { status: "ready", selector };
    }
}

function schedule(selector: string): void {
    if (!scheduled) {
        scheduled = true;
        const gen = generation;
        requestIdle((d) => work(d, gen, selector));
    }
}

function onMutations(records: MutationRecord[], selector: string): void {
    for (const m of records) {
        if (m.type === "attributes") {
            const t = m.target as Element;
            if (isOwnElement(t)) {
                continue;
            }
            if (m.attributeName === "class") {
                // A class can restyle every descendant through CSS selectors.
                enqueueSubtree(t);
            } else if (m.attributeName === "style") {
                // Layout facts are not inherited, so inline style affects only this element.
                queue.push({ kind: "layout", element: t });
            } else {
                t.matches(selector) ? add(t) : remove(t);
            }
            continue;
        }
        for (const n of m.removedNodes) {
            if (n.nodeType === Node.ELEMENT_NODE) {
                queue.push({ kind: "drop", root: n as Element });
            }
        }
        for (const n of m.addedNodes) {
            if (n.nodeType === Node.ELEMENT_NODE && !isOwnElement(n as Element)) {
                enqueueSubtree(n as Element);
            }
        }
    }
    schedule(selector);
}

// Media queries can change any element's layout facts without touching the DOM.
function onResize(): void {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
        if (state.status !== "idle") {
            enqueueSubtree(document.documentElement);
            schedule(state.selector);
        }
    }, 300);
}

export function stopElementIndex(): void {
    generation++;
    mutationObserver?.disconnect();
    intersectionObserver?.disconnect();
    window.removeEventListener("resize", onResize);
    candidates.clear();
    onScreen.clear();
    escapees.clear();
    layout = new WeakMap();
    disorderlyParents = new WeakSet();
    queue = [];
    queuedRoots.clear();
    scheduled = false;
    state = { status: "idle" };
}

function restart(selector: string): void {
    stopElementIndex();
    state = { status: "scanning", selector };
    mutationObserver = new MutationObserver((records) => onMutations(records, selector));
    // The margin keeps elements a scroll is about to reveal in the set, since
    // intersection reports arrive a frame after the scroll that caused them.
    intersectionObserver = new IntersectionObserver((entries) => {
        for (const entry of entries) {
            entry.isIntersecting ? onScreen.add(entry.target) : onScreen.delete(entry.target);
        }
    }, { rootMargin: "50% 0px" });
    observeRoot(document);
    window.addEventListener("resize", onResize);
    enqueueSubtree(document.documentElement);
    schedule(selector);
}

/**
 * Start indexing once the page has loaded and the browser is idle, working in idle
 * slices so the scan never competes with the page's own rendering.
 */
export function startElementIndexWhenIdle(getSelector: () => string): void {
    if (state.status !== "idle") {
        return;
    }
    const begin = () => requestIdle(() => {
        if (state.status === "idle") {
            restart(getSelector());
        }
    });
    if (document.readyState === "complete") {
        begin();
    } else {
        window.addEventListener("load", begin, { once: true });
    }
}

// Mutations since the last idle slice are applied before answering, so a query never
// misses what the page added just before the key press.
function catchUp(): Element[] {
    fresh = [];
    if (state.status !== "idle") {
        work(UNBOUNDED, generation, state.selector);
    }
    const added = fresh;
    fresh = null;
    return added;
}

/**
 * The on-screen candidates for `selector` in document order, or null while the index
 * cannot answer yet (still scanning, or built for another selector), in which case the
 * caller does the full scan.
 */
export function visibleCandidates(selector: string, viewport: Viewport): Element[] | null {
    if (state.status === "idle" || state.selector !== selector) {
        restart(selector);
        return null;
    }
    if (state.status !== "ready") {
        return null;
    }
    // Elements added since the last slice have no intersection report yet, so they
    // are measured directly.
    const pending = catchUp();

    const result = new Set<Element>();
    for (const e of [...onScreen, ...pending]) {
        if (e.isConnected
            && isRectOnScreen(e.getBoundingClientRect(), viewport)
            && getComputedStyle(e).visibility !== "hidden") {
            result.add(e);
        }
    }
    return [...result].sort(byDocumentOrder);
}

function hasText(e: Element): boolean {
    for (const n of e.childNodes) {
        if (n.nodeType === Node.TEXT_NODE && (n as Text).data.length > 0) {
            return true;
        }
    }
    return false;
}

function paddingBox(e: Element, r: DOMRectReadOnly): Box {
    const top = r.top + e.clientTop, left = r.left + e.clientLeft;
    return { top, left, bottom: top + e.clientHeight, right: left + e.clientWidth };
}

// The area an unclipped element's in-flow descendants can reach. Content overflowing
// up or left of the box is not counted.
// ponytail: text pushed above or left of an off-screen parent (negative margins) is missed.
function reach(e: Element, r: DOMRectReadOnly): Box {
    return {
        top: r.top,
        left: r.left,
        bottom: r.top + Math.max(r.height, e.scrollHeight),
        right: r.left + Math.max(r.width, e.scrollWidth),
    };
}

function walk(e: Element, clip: Box, out: Set<Element>, isEscapeeRoot: boolean): void {
    const f = layoutOf(e);
    if ((f & Layout.DisplayNone) || isOwnElement(e)) {
        return;
    }
    // Escapees are walked on their own, each under the clip that really applies to it.
    if ((f & Layout.Escapee) && !isEscapeeRoot) {
        return;
    }
    let inner = clip;
    if (!(f & Layout.DisplayContents)) {
        const r = e.getBoundingClientRect();
        const visible = intersects(r, clip);
        if (!visible && ((f & Layout.Clips) || !intersects(reach(e, r), clip))) {
            return;
        }
        if (visible && r.height > 0 && hasText(e)) {
            const visibility = getComputedStyle(e).visibility;
            if (visibility !== "hidden" && visibility !== "collapse") {
                out.add(e);
            }
        }
        if (f & Layout.Clips) {
            inner = intersection(clip, paddingBox(e, r));
        }
    }
    if (e.shadowRoot) {
        for (const k of e.shadowRoot.children) {
            walk(k, inner, out, false);
        }
    }
    const kids = e.children;
    // Slotted children render wherever their slot is, so a shadow host's light children
    // are in no particular order.
    if (kids.length < BISECT_MIN || (f & Layout.Disorderly) || disorderlyParents.has(e) || e.shadowRoot) {
        for (const k of kids) {
            walk(k, inner, out, false);
        }
        return;
    }
    // Children stacked top to bottom: skip those ending above the clip, stop at the first
    // one starting below it. Boxless children (display: none or contents) read as zero,
    // which only makes the search start earlier or stop later, never skip visible ones.
    // ponytail: an in-flow child overflowing past its later siblings into view can be
    // skipped; mark such lists Disorderly if they show up.
    let lo = 0, hi = kids.length - 1;
    while (lo < hi) {
        const mid = (lo + hi) >> 1;
        const r = kids[mid].getBoundingClientRect();
        if (r.top + Math.max(r.height, kids[mid].scrollHeight) <= inner.top) {
            lo = mid + 1;
        } else {
            hi = mid;
        }
    }
    for (let i = lo; i < kids.length; i++) {
        if (kids[i].getBoundingClientRect().top >= inner.bottom) {
            break;
        }
        walk(kids[i], inner, out, false);
    }
}

// The clip an escapee is drawn under: that of its containing block and everything
// above it. Clipping ancestors between it and its containing block do not clip it.
function escapeeClip(e: Element, viewport: Box): Box {
    const f = layoutOf(e);
    let block: Element | null = parentOf(e);
    if (f & (Layout.Absolute | Layout.Fixed)) {
        const establishes = (f & Layout.Fixed) ? Layout.ContainsFixed : (Layout.Positioned | Layout.ContainsFixed);
        while (block && !(layoutOf(block) & establishes)) {
            block = parentOf(block);
        }
    }
    let clip = viewport;
    for (let a = block; a; a = parentOf(a)) {
        if (layoutOf(a) & Layout.Clips) {
            clip = intersection(clip, paddingBox(a, a.getBoundingClientRect()));
        }
    }
    return clip;
}

/**
 * Elements with their own text that are on screen and not clipped away, in document
 * order; null until the index is built, in which case the caller does the full scan.
 */
export function visibleTextElements(viewport: Viewport): Element[] | null {
    if (state.status !== "ready") {
        return null;
    }
    catchUp();
    const screen: Box = { top: 0, left: 0, bottom: viewport.height, right: viewport.width };
    const out = new Set<Element>();
    walk(document.documentElement, screen, out, false);
    for (const e of escapees) {
        if (!e.isConnected) {
            escapees.delete(e);
            continue;
        }
        walk(e, escapeeClip(e, screen), out, true);
    }
    return [...out].sort(byDocumentOrder);
}
