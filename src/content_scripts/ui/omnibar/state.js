// What the omnibar's modules share. One object, because the original kept these as closure
// variables that the input handlers, the paging and the handler switch all read and write.
export function createState(ui) {
    return {
        ui,
        resultPageSpan: ui.querySelector('#sk_omnibarSearchArea>span.resultPage'),
        handlers: {},
        handler: undefined,
        lastHandler: null,
        lastInput: "",
        bookmarkFolders: undefined,
        // Ctrl-d leaves the focus index here for the next listURLs to restore.
        savedFocused: -1,
        // The current result list (`items`), its page number (`start`, 1-based), the page shown
        // (`page`) and whether folders are listed (`showFolder`).
        start: undefined,
        items: undefined,
        showFolder: undefined,
        page: undefined,
        // The arguments the omnibar was last shown with, to re-open it (Ctrl-j).
        savedArgs: undefined,
    };
}

// The position can be overridden by the handler (the LLM chat sits at the bottom).
export function getPosition(st, runtime) {
    let p = runtime.conf.omnibarPosition;
    if (st.handler && st.handler.omnibarPosition) {
        p = st.handler.omnibarPosition;
    }
    return p;
}
