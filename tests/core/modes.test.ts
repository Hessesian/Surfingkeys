import { createModesStore, keysOf } from "src/core/modes";
import type { KeyNode } from "src/core/keyDispatch";

const leaf: KeyNode = { meta: { word: "j", code: () => {} }, find: () => undefined, getWords: () => [] };
const root: KeyNode = { find: (k) => (k === "j" ? leaf : undefined), getWords: () => ["j"] };
const input = (key: string) => ({ key, isEsc: false, trusted: true, root, digitForRepeat: true, repeatThreshold: 99 });

describe("modes store", () => {
    test("a mode keeps the priority it entered with until it exits", () => {
        const store = createModesStore<{ name: string }>();
        const normal = { name: "Normal" }, disabled = { name: "Disabled" };
        store.dispatch({ type: "setPriority", mode: disabled, priority: 99 });
        store.dispatch({ type: "enter", mode: normal, priority: undefined, reentrant: false });
        const entered = store.dispatch({ type: "enter", mode: disabled, priority: 5, reentrant: false });
        expect(entered.reply).toBe(-1);
        expect(entered.effects.map((e) => e.type)).toEqual(["onEnter", "showStatus"]);
        expect(store.getState().stack).toEqual([disabled, normal]);

        expect(store.dispatch({ type: "exit", mode: disabled, peek: false }).effects)
            .toEqual([{ type: "showStatus" }, { type: "onExit", mode: disabled, pos: 1 }]);
        expect(store.getState().priority.get(disabled)).toBe(0);
        expect(store.getState().stack).toEqual([normal]);
    });

    test("the dispatch position is committed before the mapping's effects run", () => {
        const store = createModesStore<{ name: string }>();
        const normal = { name: "Normal" };
        store.dispatch({ type: "setKeys", mode: normal, patch: { node: root, repeats: "" } });
        const r = store.dispatch({ type: "key", mode: normal, input: input("j") });
        expect(r.reply.done).toBe("finish");
        expect(keysOf(store.getState(), normal).node).toBe(leaf);
        expect(r.effects.map((e) => e.type === "key" && e.effect.type)).toEqual(["setLastKeys", "run", "finish"]);

        const f = store.dispatch({ type: "finish", mode: normal, root, trusted: true });
        expect(f.reply).toBe(true);
        expect(f.effects).toEqual([{ type: "key", mode: normal, effect: { type: "hideKeystroke" } }]);
        expect(keysOf(store.getState(), normal)).toEqual({ node: root, pending: null, repeats: "" });
        expect(store.dispatch({ type: "finish", mode: normal, root, trusted: true }).reply).toBe(false);
    });

    test("reset empties the stack but keeps key state", () => {
        const store = createModesStore<{ name: string }>();
        const normal = { name: "Normal" };
        store.dispatch({ type: "setKeys", mode: normal, patch: { node: root } });
        store.dispatch({ type: "enter", mode: normal, priority: undefined, reentrant: false });
        store.dispatch({ type: "reset" });
        expect(store.getState().stack).toEqual([]);
        expect(keysOf(store.getState(), normal).node).toBe(root);
    });
});
