import { fieldCaretAfterMove, fieldRange, nextNonWord } from "src/core/textEdit";

const value = "hello big world";

describe("field edits", () => {
    test("Ctrl-u covers the field from its start to the caret", () => {
        expect(fieldRange(value, 9, 9, "lineStart")).toEqual([0, 9]);
    });

    test("word targets stop at the next non-word character", () => {
        expect(fieldRange(value, 9, 9, "wordBack")).toEqual([5, 9]);
        expect(fieldRange(value, 6, 6, "wordForward")).toEqual([6, 9]);
        // At the edge there is no word left, so the range covers one character.
        expect(fieldRange(value, 0, 0, "wordBack")).toEqual([0, 1]);
    });

    test("moves land on the far end of the target in its direction", () => {
        expect(fieldCaretAfterMove(value, 9, "wordBack")).toBe(5);
        expect(fieldCaretAfterMove(value, 6, "wordForward")).toBe(9);
        expect(fieldCaretAfterMove(value, 6, "lineStart")).toBe(0);
        expect(fieldCaretAfterMove(value, 6, "end")).toBe(value.length);
    });

    test("selection and all", () => {
        expect(fieldRange(value, 2, 4, "selection")).toEqual([2, 4]);
        expect(fieldRange(value, 2, 4, "all")).toEqual([0, value.length]);
    });

    test("nextNonWord clamps to the string", () => {
        expect(nextNonWord("abc", 1, 1)).toBe(3);
        expect(nextNonWord("abc", -1, 1)).toBe(0);
    });
});
