import { dispatchKey, finish, KeyMeta, KeyNode, KeyState } from "src/core/keyDispatch";
import { enterMode, exitMode } from "src/core/modeStack";

class Node implements KeyNode {
    children = new Map<string, Node>();
    meta?: KeyMeta;
    find(key: string) { return this.children.get(key); }
    getWords(): string[] {
        return [...this.children.values()].flatMap((c) => (c.meta ? [c.meta.word] : []).concat(c.getWords()));
    }
}

function trie(maps: Record<string, KeyMeta["code"]>) {
    const root = new Node();
    for (const [word, code] of Object.entries(maps)) {
        let n = root;
        for (const k of word) {
            if (!n.children.has(k)) n.children.set(k, new Node());
            n = n.children.get(k)!;
        }
        n.meta = { word, code, annotation: word };
    }
    return root;
}

const noop = () => {};
const takesKey = (_k: string) => {};
const root = trie({ gg: noop, j: noop, m: takesKey });
const start: KeyState = { node: root, pending: null, repeats: "" };
const input = (key: string, extra = {}) => ({ key, isEsc: false, trusted: true, root, digitForRepeat: true, repeatThreshold: 99, ...extra });

describe("dispatchKey", () => {
    test("a prefix waits for the rest of the mapping", () => {
        const r = dispatchKey(start, input("g"));
        expect(r.state.node).toBe(root.find("g"));
        expect(r.effects).toEqual([{ type: "showKeystroke", key: "g" }]);
        expect(r.stopPropagation).toBe(true);
        expect(r.done).toBe(false);
    });

    test("a complete mapping runs once per repeat, then finishes", () => {
        const counted = dispatchKey(dispatchKey(start, input("3")).state, input("j"));
        expect(counted.effects).toEqual([
            { type: "setLastKeys", word: "j" },
            { type: "run", code: noop, times: 3 },
            { type: "finish" },
        ]);
        expect(counted.state.node).toBe(root.find("j"));
        expect(counted.done).toBe("finish");
    });

    test("repeats over the threshold ask first", () => {
        const s = { ...start, repeats: "500" };
        expect(dispatchKey(s, input("j")).effects[1]).toMatchObject({ type: "confirmRun", times: 500 });
    });

    test("0 only counts after another digit", () => {
        expect(dispatchKey(start, input("0")).state.repeats).toBe("");
        expect(dispatchKey({ ...start, repeats: "1" }, input("0")).state.repeats).toBe("10");
    });

    test("a mapping that takes an argument receives the next key", () => {
        const waiting = dispatchKey(start, input("m")).state;
        expect(waiting.pending).toBe(takesKey);
        expect(dispatchKey(waiting, input("a")).effects).toEqual([
            { type: "setLastKeys", word: "ma" },
            { type: "callPending", code: takesKey, key: "a" },
            { type: "finish" },
        ]);
    });

    test("an unmatched key resets and is suppressed only after a prefix", () => {
        const atRoot = dispatchKey(start, input("x"));
        expect(atRoot.suppressed).toBe(false);
        expect(atRoot.stopPropagation).toBeUndefined();
        const afterPrefix = dispatchKey(dispatchKey(start, input("g")).state, input("x"));
        expect(afterPrefix.suppressed).toBe(true);
        expect(afterPrefix.state).toEqual(start);
        expect(afterPrefix.effects[0]).toEqual({ type: "noMatch", last: root.find("g") });
        expect(afterPrefix.done).toBe(true);
    });

    test("Esc cancels pending keys, but at the root it is dispatched like any key", () => {
        const cancelled = dispatchKey(dispatchKey(start, input("g")).state, input("<esc>", { isEsc: true }));
        expect(cancelled).toMatchObject({ state: start, stopPropagation: true, suppressed: true, done: true });
        expect(dispatchKey(start, input("<esc>", { isEsc: true })).effects[0]).toMatchObject({ type: "noMatch" });
    });

    test("untrusted events show no keystrokes", () => {
        expect(dispatchKey(start, input("g", { trusted: false })).effects).toEqual([]);
    });

    test("finish reports whether there was anything to reset", () => {
        expect(finish(start, root).changed).toBe(false);
        expect(finish({ ...start, repeats: "2" }, root)).toEqual({ state: start, changed: true });
    });
});

describe("mode stack", () => {
    const m = (name: string, priority: number) => ({ name, priority });
    const rank = (x: { priority: number }) => x.priority;

    test("entering sorts by priority, highest first", () => {
        const normal = m("Normal", 1), insert = m("Insert", 2), disabled = m("Disabled", 99);
        let stack = enterMode([], normal, false, rank).stack;
        stack = enterMode(stack, disabled, false, rank).stack;
        stack = enterMode(stack, insert, false, rank).stack;
        expect(stack.map((x) => x.name)).toEqual(["Disabled", "Insert", "Normal"]);
    });

    test("re-entering pops the modes above; otherwise it is reported", () => {
        const a = m("A", 1), b = m("B", 1);
        const stack = [b, a];
        expect(enterMode(stack, a, true, rank).stack).toEqual([a]);
        expect(enterMode(stack, a, false, rank)).toMatchObject({ stack: [b, a], pos: 1, duplicate: [b, a] });
    });

    test("exit pops the mode and those above; peek removes only it", () => {
        const a = m("A", 3), b = m("B", 2), c = m("C", 1);
        expect(exitMode([a, b, c], b, false)).toEqual({ stack: [c], pos: 2 });
        expect(exitMode([a, b, c], b, true)).toEqual({ stack: [a, c], pos: 1 });
        expect(exitMode([a, c], b, false)).toEqual({ stack: [a, c], pos: -1 });
    });
});
