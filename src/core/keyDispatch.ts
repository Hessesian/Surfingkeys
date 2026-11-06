// Pure key dispatch for one mode: given where the mode is in its mapping trie and the
// key just pressed, decide the next position and the effects to run. Nothing here
// touches the DOM, the event or the mode object; mode.js interprets the result.

export type MapCode = (...args: any[]) => unknown;

export interface KeyMeta {
    readonly word: string;
    readonly code: MapCode;
    readonly annotation?: string;
    readonly stopPropagation?: (key: string) => boolean;
    readonly repeatNoThrottling?: boolean;
}

export interface KeyNode {
    readonly meta?: KeyMeta;
    find(key: string): KeyNode | undefined;
    getWords(): string[];
}

export type KeyState = {
    readonly node: KeyNode;
    // A mapping whose code takes the next key as its argument, e.g. `m` + mark name.
    readonly pending: MapCode | null;
    // Digits typed so far as a repeat count; undefined for modes without repeats.
    readonly repeats: string | undefined;
};

export type KeyInput = {
    readonly key: string;
    readonly isEsc: boolean;
    readonly trusted: boolean;
    readonly root: KeyNode;
    readonly digitForRepeat: boolean;
    readonly repeatThreshold: number;
};

export type KeyEffect =
    | { readonly type: "showKeystroke"; readonly key: string }
    | { readonly type: "hideKeystroke" }
    | { readonly type: "setLastKeys"; readonly word: string }
    | { readonly type: "noMatch"; readonly last: KeyNode }
    | { readonly type: "callPending"; readonly code: MapCode; readonly key: string }
    | { readonly type: "run"; readonly code: MapCode; readonly times: number }
    | { readonly type: "confirmRun"; readonly code: MapCode; readonly times: number; readonly annotation: string }
    // Reset to the root once the effects before it have run; they may move the mode.
    | { readonly type: "finish" };

export type KeyResult = {
    // Committed before the effects run: mapping code reads the matched node from it.
    readonly state: KeyState;
    readonly effects: readonly KeyEffect[];
    // Undefined leaves the event's flag as it was: only some outcomes decide it.
    readonly stopPropagation?: boolean;
    readonly suppressed?: boolean;
    // "finish" means: whatever the trailing finish effect reports.
    readonly done: boolean | "finish";
};

export function finish(s: KeyState, root: KeyNode): { readonly state: KeyState; readonly changed: boolean } {
    const changed = s.node !== root || s.pending !== null || !!s.repeats;
    if (!changed) {
        return { state: s, changed };
    }
    return { state: { node: root, pending: null, repeats: s.repeats === undefined ? undefined : "" }, changed };
}

function stopFor(meta: KeyMeta | undefined, key: string): boolean {
    return !meta?.stopPropagation || meta.stopPropagation(key);
}

const result = (
    state: KeyState,
    effects: readonly KeyEffect[],
    rest: Partial<Omit<KeyResult, "state" | "effects">> = {},
): KeyResult => ({ state, effects, done: false, ...rest });

export function dispatchKey(s: KeyState, input: KeyInput): KeyResult {
    const { key, trusted, root } = input;
    const show: readonly KeyEffect[] = trusted ? [{ type: "showKeystroke", key }] : [];

    if (input.isEsc) {
        const f = finish(s, root);
        if (f.changed) {
            return result(f.state, trusted ? [{ type: "hideKeystroke" }] : [], { stopPropagation: true, suppressed: true, done: true });
        }
    }

    if (s.pending) {
        return result(s, [
            { type: "setLastKeys", word: (s.node.meta?.word ?? "") + key },
            { type: "callPending", code: s.pending, key },
            { type: "finish" },
        ], { stopPropagation: stopFor(s.node.meta, key), done: "finish" });
    }

    if (s.repeats !== undefined
        && s.node === root
        && input.digitForRepeat
        && (key >= "1" || (s.repeats !== "" && key >= "0")) && key <= "9"
        && root.getWords().length > 0) {
        return result({ ...s, repeats: s.repeats + key }, show, { stopPropagation: true });
    }

    const next = s.node.find(key);
    if (!next) {
        // Leaving the root counts as an action even when nothing matched: the keys
        // typed so far are dropped.
        const reset: KeyState = { node: root, pending: null, repeats: s.repeats === undefined ? undefined : "" };
        return result(reset, [
            { type: "noMatch", last: s.node },
            ...(trusted ? [{ type: "hideKeystroke" } as const] : []),
        ], { suppressed: s.node !== root, done: true });
    }

    const meta = next.meta;
    if (!meta) {
        return result({ ...s, node: next }, show, { stopPropagation: true });
    }
    if (meta.code.length) {
        return result({ ...s, node: next, pending: meta.code }, show, { stopPropagation: true });
    }

    const times = parseInt(s.repeats ?? "") || 1;
    const run: KeyEffect = !meta.repeatNoThrottling && times > input.repeatThreshold
        ? { type: "confirmRun", code: meta.code, times, annotation: meta.annotation ?? "" }
        : { type: "run", code: meta.code, times };
    return result({ ...s, node: next }, [
        { type: "setLastKeys", word: meta.word },
        run,
        { type: "finish" },
    ], { stopPropagation: stopFor(meta, key), done: "finish" });
}
