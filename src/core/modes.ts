// The content script's mode state: which modes are on the stack, in what order, and
// where each one is in its key mappings. Only `updateModes` changes it.

import { dispatchKey, finish, KeyEffect, KeyInput, KeyNode, KeyResult, MapCode } from "./keyDispatch";
import { enterMode, exitMode } from "./modeStack";
import { createStore, Step } from "./store";

export interface ModeRef {
    readonly name: string;
}

export type ModeKeys = {
    readonly node: KeyNode | undefined;
    readonly pending: MapCode | null;
    readonly repeats: string | undefined;
};

export type ModesState<M> = {
    readonly stack: readonly M[];
    readonly keys: ReadonlyMap<M, ModeKeys>;
    readonly priority: ReadonlyMap<M, number>;
};

export type ModesMsg<M> =
    | { readonly type: "enter"; readonly mode: M; readonly priority: number | undefined; readonly reentrant: boolean }
    | { readonly type: "exit"; readonly mode: M; readonly peek: boolean }
    | { readonly type: "key"; readonly mode: M; readonly input: KeyInput }
    | { readonly type: "finish"; readonly mode: M; readonly root: KeyNode; readonly trusted: boolean }
    | { readonly type: "setKeys"; readonly mode: M; readonly patch: Partial<ModeKeys> }
    | { readonly type: "setPriority"; readonly mode: M; readonly priority: number }
    | { readonly type: "reset" };

export type ModesEffect<M> =
    | { readonly type: "reportDuplicate"; readonly mode: M; readonly stack: readonly M[] }
    | { readonly type: "onEnter"; readonly mode: M }
    | { readonly type: "onExit"; readonly mode: M; readonly pos: number }
    | { readonly type: "showStatus" }
    | { readonly type: "key"; readonly mode: M; readonly effect: KeyEffect };

export type ModesReplies = {
    enter: number;
    exit: number;
    key: KeyResult;
    finish: boolean;
    setKeys: undefined;
    setPriority: undefined;
    reset: undefined;
};

const NO_KEYS: ModeKeys = { node: undefined, pending: null, repeats: undefined };

export function emptyModes<M>(): ModesState<M> {
    return { stack: [], keys: new Map(), priority: new Map() };
}

export function keysOf<M>(s: ModesState<M>, mode: M): ModeKeys {
    return s.keys.get(mode) ?? NO_KEYS;
}

function withKeys<M>(s: ModesState<M>, mode: M, keys: ModeKeys): ModesState<M> {
    return { ...s, keys: new Map(s.keys).set(mode, keys) };
}

function withPriority<M>(s: ModesState<M>, mode: M, priority: number): ModesState<M> {
    return { ...s, priority: new Map(s.priority).set(mode, priority) };
}

type ModesStep<M> = Step<ModesState<M>, ModesEffect<M>, unknown>;

const step = <M>(state: ModesState<M>, effects: readonly ModesEffect<M>[], reply?: unknown): ModesStep<M> =>
    ({ state, effects, reply });

export function updateModes<M>(s: ModesState<M>, msg: ModesMsg<M>): ModesStep<M> {
    switch (msg.type) {
        case "enter": {
            const { mode } = msg;
            // A mode keeps the priority it was first given until it exits.
            const ranked = s.priority.get(mode) ? s : withPriority(s, mode, msg.priority || s.stack.length);
            const r = enterMode(ranked.stack, mode, msg.reentrant, (m) => ranked.priority.get(m) ?? 0);
            return step({ ...ranked, stack: r.stack }, [
                ...(r.duplicate ? [{ type: "reportDuplicate", mode, stack: r.duplicate } as const] : []),
                { type: "onEnter", mode },
                { type: "showStatus" },
            ], r.pos);
        }
        case "exit": {
            const { mode } = msg;
            const r = exitMode(s.stack, mode, msg.peek);
            const exited = r.pos === -1 ? s : withPriority(s, mode, 0);
            return step({ ...exited, stack: r.stack }, [
                { type: "showStatus" },
                { type: "onExit", mode, pos: r.pos },
            ], r.pos);
        }
        case "key": {
            const { mode, input } = msg;
            const k = keysOf(s, mode);
            const r = dispatchKey({ node: k.node ?? input.root, pending: k.pending, repeats: k.repeats }, input);
            return step(withKeys(s, mode, r.state), r.effects.map((effect) => ({ type: "key", mode, effect } as const)), r);
        }
        case "finish": {
            const { mode } = msg;
            const k = keysOf(s, mode);
            const f = finish({ node: k.node ?? msg.root, pending: k.pending, repeats: k.repeats }, msg.root);
            if (!f.changed) {
                return step(s, [], false);
            }
            return step(withKeys(s, mode, f.state), msg.trusted ? [{ type: "key", mode, effect: { type: "hideKeystroke" } }] : [], true);
        }
        case "setKeys":
            return step(withKeys(s, msg.mode, { ...keysOf(s, msg.mode), ...msg.patch }), []);
        case "setPriority":
            return step(withPriority(s, msg.mode, msg.priority), []);
        case "reset":
            return step({ ...s, stack: [] }, []);
    }
}

export function createModesStore<M extends ModeRef>() {
    return createStore<ModesState<M>, ModesMsg<M>, ModesEffect<M>, ModesReplies>(emptyModes<M>(), updateModes);
}
