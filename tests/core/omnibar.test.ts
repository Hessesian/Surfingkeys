import {
    bookmarkTarget, highlightMatches, isUrl, matchFolders, nextPageNumber, onlyFolders, pageRange, parseCommand,
    prevPageNumber, rotatedIndex, shouldCollapseAlias, shouldExpandAlias, urlItemFromInput, urlItemMeta,
} from "src/core/omnibar";

test("isUrl", () => {
    expect(isUrl("https://a")).toBe(true);
    expect(isUrl("example.com/x?y=1")).toBe(true);
    expect(isUrl("www.example.com")).toBe(true);
    expect(isUrl("two words.com")).toBe(false);
    expect(isUrl("plain")).toBe(false);
});

test("urlItemFromInput", () => {
    expect(urlItemFromInput("example.com")).toEqual({ title: "example.com", url: "http://example.com" });
    expect(urlItemFromInput("https://example.com/a")).toEqual({ title: "https://example.com/a", url: "https://example.com/a" });
    expect(urlItemFromInput("https://localhost:8080")).toEqual({ title: "https://localhost:8080", url: "https://localhost:8080" });
    expect(urlItemFromInput("nothing")).toBeNull();
});

test("highlightMatches", () => {
    expect(highlightMatches(null, "abc")).toBe("abc");
    expect(highlightMatches(/b/gi, "abc")).toBe("a<span class=omnibar_highlight>b</span>c");
    expect(highlightMatches(null, "data:image/png;" + "x".repeat(2000))).toHaveLength(1024);
});

test("urlItemMeta picks the kind from the fields present", () => {
    expect(urlItemMeta({ url: "u", lastVisitTime: 1 })).toEqual({ kind: "history", type: "🕜", uid: "Hu" });
    expect(urlItemMeta({ url: "u", dateAdded: 1, id: "7" })).toEqual({ kind: "bookmark", type: "⭐", uid: "B7" });
    expect(urlItemMeta({ url: "u", width: 1, windowId: 2, id: 3 })).toEqual({ kind: "tab", type: "🔖", uid: "T2:3" });
    expect(urlItemMeta({ url: "u", type: "🔗", uid: "Mx" })).toEqual({ kind: "custom", type: "🔗", uid: "Mx" });
    expect(urlItemMeta({ url: "u", uid: "q" })).toEqual({ kind: "plain", type: "🔥", uid: "q" });
});

test("alias expansion and collapse decisions", () => {
    expect(shouldExpandAlias("g", { g: 1 }, false)).toBe(true);
    expect(shouldExpandAlias("g", { g: 1 }, true)).toBe(false);
    expect(shouldExpandAlias("", { "": 1 }, false)).toBe(false);
    expect(shouldCollapseAlias(true, false, "", "ab")).toBe(true);
    expect(shouldCollapseAlias(true, false, "ab", "ab")).toBe(true);
    expect(shouldCollapseAlias(true, false, "abc", "ab")).toBe(false);
    expect(shouldCollapseAlias(false, false, "", undefined)).toBe(false);
    expect(shouldCollapseAlias(true, true, "", undefined)).toBe(false);
});

test("paging", () => {
    expect(pageRange(1, 10, 25, 500)).toEqual({ si: 0, ei: 10, label: "1 - 10 / 25" });
    expect(pageRange(3, 10, 25, 500)).toEqual({ si: 20, ei: 25, label: "21 - 25 / 25" });
    expect(pageRange(1, 10, 500, 500).label).toBe("1 - 10 / 500+");
    expect(nextPageNumber(1, 10, 25)).toBe(2);
    expect(nextPageNumber(3, 10, 25)).toBe(1);
    expect(prevPageNumber(2, 10, 25)).toBe(1);
    expect(prevPageNumber(1, 10, 25)).toBe(3);
});

test("rotatedIndex cycles through results and the typed query", () => {
    expect(rotatedIndex(3, -1, false)).toBe(0);
    expect(rotatedIndex(3, 0, false)).toBe(1);
    expect(rotatedIndex(3, 2, false)).toBe(3);
    expect(rotatedIndex(3, -1, true)).toBe(2);
    expect(rotatedIndex(3, 0, true)).toBe(3);
});

test("onlyFolders", () => {
    expect(onlyFolders([{ url: "a" }, {}, { url: undefined }])).toEqual([{}, { url: undefined }]);
});

test("parseCommand", () => {
    expect(parseCommand("  set a b ")).toEqual(["set", "a", "b"]);
    expect(parseCommand('open "two words" x')).toEqual(["open", "two words", "x"]);
    expect(parseCommand("")).toEqual([""]);
});

test("bookmarkTarget and matchFolders", () => {
    const folders = [{ id: "1", title: "/Bar/" }, { id: "2", title: "/Bar/Sub/" }];
    expect(bookmarkTarget("/Bar/Sub/new/Title", folders)).toEqual({ title: "Title", folder: "2", path: ["new"], folderName: "/Bar/Sub/new" });
    expect(bookmarkTarget("/Bar/Title", folders)).toEqual({ title: "Title", folder: "1", path: [], folderName: "/Bar" });
    expect(bookmarkTarget("/Nope/Title", folders)).toEqual({ title: "Title", folder: undefined, path: ["Nope"], folderName: undefined });
    expect(matchFolders(folders, "sub", false)).toEqual([folders[1]]);
    expect(matchFolders(folders, "sub", true)).toEqual([]);
});
