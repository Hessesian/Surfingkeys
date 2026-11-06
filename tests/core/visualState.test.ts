import { afterEsc, nextState, stateOnClick } from "src/core/visualState";

describe("visual state", () => {
    test("the visual key cycles off, caret, range", () => {
        expect([0, 1, 2].map(nextState)).toEqual([1, 2, 0]);
    });

    test("Esc steps back one state and stops at off", () => {
        expect([0, 1, 2].map(afterEsc)).toEqual([0, 0, 1]);
    });

    test("a click follows the page selection", () => {
        expect(stateOnClick(2, "None")).toBe(0);
        expect(stateOnClick(0, "Caret")).toBe(1);
        expect(stateOnClick(2, "Caret")).toBe(2);
        expect(stateOnClick(1, "Range")).toBe(2);
        expect(stateOnClick(1, "Other")).toBe(1);
    });
});
