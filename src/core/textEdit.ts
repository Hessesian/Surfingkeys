// Insert-mode edits as data. A command names a target relative to the caret; for an
// input or textarea the range it covers is computed here, purely, and for a
// contenteditable the interpreter asks the browser (Selection.modify), since only the
// browser knows where a rendered line or word ends there.

// In a field the whole value counts as one line: lineStart is 0 and end is its length.
export type Target = "lineStart" | "end" | "wordBack" | "wordForward" | "all" | "selection";

export type EditCommand =
    | { readonly type: "move"; readonly to: Target }
    | { readonly type: "replace"; readonly target: Target; readonly text: string };

export const FORWARD: ReadonlySet<Target> = new Set(["end", "wordForward"]);

const NON_WORD = /\W/;

// The first non-word character from cur in direction dir, clamped to the string.
export function nextNonWord(str: string, dir: 1 | -1, cur: number): number {
    for (let i = cur + dir; ; i += dir) {
        if (i < 0) return 0;
        if (i >= str.length) return str.length;
        if (NON_WORD.test(str[i])) return i;
    }
}

export function nextWordRange(str: string, dir: 1 | -1, cur: number): [number, number] {
    const pos = nextNonWord(str, dir, cur);
    return pos === cur ? [pos, pos + 1] : [Math.min(pos, cur), Math.max(pos, cur)];
}

export function fieldRange(value: string, start: number, end: number, target: Target): [number, number] {
    switch (target) {
        case "lineStart": return [0, start];
        case "end": return [start, value.length];
        case "wordBack": return nextWordRange(value, -1, start);
        case "wordForward": return nextWordRange(value, 1, start);
        case "all": return [0, value.length];
        case "selection": return [start, end];
    }
}

// Where a move leaves the caret: the far end of the target in its direction.
export function fieldCaretAfterMove(value: string, start: number, target: Target): number {
    const [from, to] = fieldRange(value, start, start, target);
    return FORWARD.has(target) ? to : from;
}
