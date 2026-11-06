// Omnibar decisions with no DOM: what counts as a URL, which icon a result gets, when an
// alias switches the engine, how results are paged and cycled. ui/omnibar/ owns the
// elements, the handlers and the RUNTIME calls.

// A URL the omnibar opens as typed (the rest is searched with the default engine).
export function isUrl(input: string): boolean {
    if (input.match(/\s+/)) {
        return false;
    }
    if (input.match(/^https?:\/\//)) {
        return true;
    }
    const regex = /^(?:www\.)?[-a-zA-Z0-9@:%._\+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b(?:[-a-zA-Z0-9()@:%_\+.~#?&\/=]*)$/;
    return !!input.match(regex);
}

export interface UrlItem { title: string; url: string }

// The result that opens what was typed, when it looks like a host name or a URL.
export function urlItemFromInput(str: string): UrlItem | null {
    const urlPat = /^(?:https?:\/\/)?(?:[^@\/\n]+@)?(?:www\.)?([^:\/\n\s]+)\.([^:\/\n\s]+)/i;
    const urlPat1 = /^https?:\/\/(?:[^@\/\n]+@)?([^:\/\n\s]+)/i;
    if (urlPat.test(str)) {
        return { title: str, url: /^https?:\/\//.test(str) ? str : "http://" + str };
    }
    if (urlPat1.test(str)) {
        return { title: str, url: str };
    }
    return null;
}

// Wraps every match of `rxp` (null: none) in a highlight span. A data: image URL is cut
// first, since a megabyte of base64 is not worth rendering.
export function highlightMatches(rxp: RegExp | null, str: string): string {
    if (str.substr(0, 11) === "data:image/") {
        str = str.substr(0, 1024);
    }
    return rxp === null ? str : str.replace(rxp, m => "<span class=omnibar_highlight>" + m + "</span>");
}

export type UrlItemKind = "history" | "bookmark" | "tab" | "custom" | "plain";
export interface UrlItemMeta { kind: UrlItemKind; type: string; uid: string | undefined }

// Which icon, which uid prefix (H history, B bookmark, T tab) and which extra info a URL
// result gets, read off the fields the background filled in.
export function urlItemMeta(b: any): UrlItemMeta {
    if (b.hasOwnProperty("lastVisitTime")) {
        return { kind: "history", type: "🕜", uid: "H" + b.url };
    }
    if (b.hasOwnProperty("dateAdded")) {
        return { kind: "bookmark", type: "⭐", uid: "B" + b.id };
    }
    if (b.hasOwnProperty("width")) {
        return { kind: "tab", type: "🔖", uid: "T" + b.windowId + ":" + b.id };
    }
    // An emoji `type` a user URL list may bring along.
    if (b.type && b.type.length === 2 && b.type.charCodeAt(0) > 255) {
        return { kind: "custom", type: b.type, uid: b.uid };
    }
    return { kind: "plain", type: "🔥", uid: b.uid };
}

// Alias + Space switches to that engine, unless the engine is already the handler.
export function shouldExpandAlias(alias: string, aliases: object, inSearchEngine: boolean): boolean {
    return !inSearchEngine && alias.length > 0 && aliases.hasOwnProperty(alias);
}

// Backspace on an empty query (or right at the point the alias was expanded) goes back.
export function shouldCollapseAlias(
    hasLast: boolean, lastIsCurrent: boolean, value: string, collapsingPoint: string | undefined,
): boolean {
    return hasLast && !lastIsCurrent && (value === collapsingPoint || value === "");
}

// 1-based page `start` of `size` results among `total`: the slice bounds and the "a - b / n" label.
export function pageRange(start: number, size: number, total: number, cacheSize: number) {
    const si = (start - 1) * size;
    const ei = Math.min(si + size, total);
    const shown = total === cacheSize ? total + "+" : total;
    return { si, ei, label: `${si + 1} - ${ei} / ${shown}` };
}

// Ctrl-. wraps to the first page after the last.
export function nextPageNumber(start: number, size: number, total: number): number {
    return start * size < total ? start + 1 : 1;
}

// Ctrl-, wraps to the last page before the first.
export function prevPageNumber(start: number, size: number, total: number): number {
    return start > 1 ? start - 1 : Math.ceil(total / size);
}

// Tab cycles through the `total` results and one more slot, the typed query. `focused` is the
// focused index, or -1 for none; the result is the index to focus, `total` meaning the query.
export function rotatedIndex(total: number, focused: number, backward: boolean): number {
    const last = focused === -1 ? total : focused;
    return (backward ? last + total : last + total + 2) % (total + 1);
}

export function onlyFolders<T extends { url?: string }>(bookmarks: T[]): T[] {
    return bookmarks.filter(b => !b.hasOwnProperty("url") || b.url === undefined);
}

// A command line split on spaces; double quotes group, and are dropped.
export function parseCommand(cmdline: string): string[] {
    cmdline = cmdline.trim();
    const tokens: string[] = [];
    let pendingToken = false, part = "";
    for (let i = 0; i < cmdline.length; i++) {
        if (cmdline.charAt(i) === " " && !pendingToken) {
            tokens.push(part);
            part = "";
        } else if (cmdline.charAt(i) === '"') {
            pendingToken = !pendingToken;
        } else {
            part += cmdline.charAt(i);
        }
    }
    tokens.push(part);
    return tokens;
}

export interface Folder { id: string; title: string }

// "/Work/Docs/new title" -> the longest leading path that names a folder, the folders still
// to create below it, and the title. `folder` is undefined when no leading path matches.
export function bookmarkTarget(input: string, folders: Folder[]) {
    let path = input.split("/");
    const title = path.pop() as string;
    path = path.filter(p => p.length > 0);
    for (let l = path.length; l > 0; l--) {
        const found = folders.filter(f => f.title === `/${path.slice(0, l).join("/")}/`);
        if (found.length) {
            return { title, folder: found[0].id, path: path.slice(l), folderName: "/" + path.join("/") };
        }
    }
    return { title, folder: undefined, path, folderName: undefined };
}

export function matchFolders<T extends { title: string }>(folders: T[], query: string, caseSensitive: boolean): T[] {
    return folders.filter(b => caseSensitive
        ? b.title.indexOf(query) !== -1
        : b.title.toLowerCase().indexOf(query.toLowerCase()) !== -1);
}
