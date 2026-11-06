import { genLabels, hintLeft, isCapital, nudgeHint, steppedPageUrl } from "src/core/hintLabels";

describe("genLabels", () => {
    test("single characters while they suffice, upper-cased", () => {
        expect(genLabels("asd", 2)).toEqual(["A", "S"]);
        expect(genLabels("asd", 3)).toEqual(["A", "S", "D"]);
    });
    test("a character that starts longer labels is not also a label", () => {
        expect(genLabels("ab", 3)).toEqual(["B", "AA", "AB"]);
        expect(genLabels("ab", 5)).toEqual(["AB", "BA", "BB", "AAA", "AAB"]);
    });
    test("zero still terminates", () => {
        expect(genLabels("ab", 0)).toEqual([]);
    });
});

test("isCapital", () => {
    expect(isCapital("A")).toBe(true);
    expect(isCapital("a")).toBe(false);
    expect(isCapital("1")).toBe(false);
    expect(isCapital("<Esc>".toLowerCase())).toBe(false);
});

describe("hintLeft", () => {
    test("alignment", () => {
        expect(hintLeft("left", 100, 50, 0, 0, 1000)).toBe(100);
        expect(hintLeft("right", 100, 50, 0, 0, 1000)).toBe(150);
        expect(hintLeft("center", 100, 50, 0, 0, 1000)).toBe(125);
    });
    test("clamped inside the page", () => {
        expect(hintLeft("left", -50, 10, 0, 0, 1000)).toBe(0);
        expect(hintLeft("left", 990, 10, 0, 0, 1000)).toBe(968);
    });
});

test("nudgeHint", () => {
    expect(nudgeHint(10, 105, 10, 100)).toEqual({ top: 10, left: 120 });
    expect(nudgeHint(15, 100, 10, 100)).toEqual({ top: 30, left: 100 });
    expect(nudgeHint(50, 50, 10, 100)).toEqual({ top: 50, left: 50 });
});

describe("steppedPageUrl", () => {
    const rx = [/(.*\?p=)(\d+)(.*)/i];
    test("steps the number", () => {
        expect(steppedPageUrl("http://a/?p=3&x", rx, 1)).toBe("http://a/?p=4&x");
        expect(steppedPageUrl("http://a/?p=3", rx, -1)).toBe("http://a/?p=2");
    });
    test("null when nothing matches", () => {
        expect(steppedPageUrl("http://a/", rx, 1)).toBeNull();
    });
});
