import { boundaryHit, clampScroll, scrollDelta } from "src/core/scroll";

const m = { scrollTop: 300, scrollLeft: 40, scrollHeight: 5000, scrollWidth: 2000, width: 800, height: 600 };

describe("scrollDelta", () => {
    test("relative moves scale with the count", () => {
        expect(scrollDelta("down", m, 70, 0)).toEqual([0, 70]);
        expect(scrollDelta("down", m, 70, 3)).toEqual([0, 210]);
        expect(scrollDelta("pageUp", m, 70, 0)).toEqual([0, -300]);
        expect(scrollDelta("left", m, 70, 0)).toEqual([-35, 0]);
    });

    test("edges are measured from the current position", () => {
        expect(scrollDelta("top", m, 70, 0)).toEqual([0, -300]);
        expect(scrollDelta("bottom", m, 70, 0)).toEqual([40, 4700]);
        expect(scrollDelta("rightmost", m, 70, 0)).toEqual([1180, 0]);
    });

    test("byRatio centres the given percentage of the page", () => {
        expect(scrollDelta("byRatio", m, 70, 50)).toEqual([0, 2500 - 300 - 300]);
    });
});

test("boundaryHit only when pushing past the edge", () => {
    expect(boundaryHit(0, 5000, 600, -10)).toBe("top");
    expect(boundaryHit(0, 5000, 600, 10)).toBeNull();
    expect(boundaryHit(4400, 5000, 600, 10)).toBe("bottom");
});

test("clampScroll", () => {
    expect(clampScroll(50, 100, true)).toEqual({ value: 50, hit: false });
    expect(clampScroll(150, 100, true)).toEqual({ value: 100, hit: true });
    expect(clampScroll(-5, 100, false)).toEqual({ value: 0, hit: true });
});
