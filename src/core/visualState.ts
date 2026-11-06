// The three states of visual mode as data: 0 is not selecting, 1 a caret, 2 a range.
// The DOM side (cursor, selection, status line) lives in content_scripts/common/visual/.

export const STATE_NAMES = ["", "Caret", "Range"] as const;

// The next state when the visual key is pressed again: off -> caret -> range -> off.
export function nextState(state: number): number {
    return (state + 1) % 3;
}

// Esc steps one state back: a range collapses to a caret, a caret leaves visual mode.
export function afterEsc(state: number): number {
    return state > 0 ? state - 1 : state;
}

// The state a click on the page puts visual mode in, from what the page selection became.
// A click can only raise a caret to a range or off to a caret, never lower one.
export function stateOnClick(state: number, selectionType: string): number {
    switch (selectionType) {
        case "None": return 0;
        case "Caret": return state === 0 ? 1 : state;
        case "Range": return 2;
        default: return state;
    }
}
