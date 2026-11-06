// Pure mode-stack transitions. The stack is ordered by priority, highest first, and
// the head is the mode that sees events first.

export interface Ranked {
    readonly name: string;
    readonly priority: number;
}

export type EnterResult<M> = {
    readonly stack: readonly M[];
    // Where the mode was before entering, -1 if it was not on the stack.
    readonly pos: number;
    // Set when a mode already under others is entered without `reentrant`.
    readonly duplicate?: string;
};

// Stable, so modes of equal priority keep their order.
function byPriority<M extends Ranked>(stack: readonly M[]): readonly M[] {
    return [...stack].sort((a, b) => b.priority - a.priority);
}

export function enterMode<M extends Ranked>(stack: readonly M[], mode: M, reentrant: boolean): EnterResult<M> {
    const pos = stack.indexOf(mode);
    if (pos === -1) {
        return { stack: byPriority([mode, ...stack]), pos };
    }
    if (pos > 0 && reentrant) {
        // Re-entering pops every mode above it.
        return { stack: byPriority(stack.slice(pos)), pos };
    }
    const duplicate = pos > 0 ? stack.map((m) => m.name).join(",") : undefined;
    return { stack: byPriority(stack), pos, ...(duplicate ? { duplicate } : {}) };
}

export function exitMode<M>(stack: readonly M[], mode: M, peek: boolean): { readonly stack: readonly M[]; readonly pos: number } {
    const pos = stack.indexOf(mode);
    if (pos === -1) {
        return { stack, pos };
    }
    if (peek) {
        // Only this mode leaves; the ones above it stay.
        return { stack: [...stack.slice(0, pos), ...stack.slice(pos + 1)], pos };
    }
    // Otherwise this mode and everything above it leave.
    return { stack: stack.slice(pos + 1), pos: pos + 1 };
}
