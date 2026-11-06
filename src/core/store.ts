// One state, changed only by dispatching a message through a pure update. dispatch
// commits the new state before returning, then the caller runs the effects; an effect
// may dispatch again and sees the state as already committed.

export type Step<S, E, R> = {
    readonly state: S;
    readonly effects: readonly E[];
    readonly reply: R;
};

export type Store<S, M extends { readonly type: string }, E, Replies extends Record<M["type"], unknown>> = {
    getState(): S;
    dispatch<T extends M["type"]>(msg: Extract<M, { readonly type: T }>): { readonly effects: readonly E[]; readonly reply: Replies[T] };
};

export function createStore<S, M extends { readonly type: string }, E, Replies extends Record<M["type"], unknown>>(
    init: S,
    update: (state: S, msg: M) => Step<S, E, unknown>,
): Store<S, M, E, Replies> {
    let state = init;
    return {
        getState: () => state,
        dispatch(msg) {
            const step = update(state, msg);
            state = step.state;
            return { effects: step.effects, reply: step.reply as never };
        },
    };
}
