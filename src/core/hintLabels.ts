// Hint decisions with no DOM: which labels exist, where a hint sits horizontally, and
// which URL the next/previous page is. hints/ owns the elements and the timers.

// `total` labels from `characters`, shortest first. A character that has been expanded
// into longer labels is dropped, so no label is a prefix of another.
export function genLabels(characters: string, total: number): string[] {
    const chars = characters.toUpperCase();
    let hints = [""], offset = 0;
    while (hints.length - offset < total || offset == 0) {
        const prefix = hints[offset++];
        for (let i = 0; i < chars.length; i++) {
            hints.push(prefix + chars[i]);
        }
    }
    return hints.slice(offset, offset + total);
}

// A letter with a case; symbols and special keys are not "capital".
export function isCapital(key: string): boolean {
    return key === key.toUpperCase() && key !== key.toLowerCase();
}

// Where a hint's left edge goes for an element at `rectLeft` (viewport) that is `rectWidth`
// wide, kept 32px inside the visible page. `origin` is the hints' coordinate origin.
export function hintLeft(
    align: string, rectLeft: number, rectWidth: number,
    origin: number, pageXOffset: number, innerWidth: number,
): number {
    const width = Math.min(rectWidth, innerWidth);
    let left: number;
    if (align === "right") {
        left = pageXOffset + rectLeft - origin + width;
    } else if (align === "left") {
        left = pageXOffset + rectLeft - origin;
    } else {
        left = pageXOffset + rectLeft - origin + width / 2;
    }
    if (left < pageXOffset) {
        left = pageXOffset;
    } else if (left + 32 > pageXOffset + innerWidth) {
        left = pageXOffset + innerWidth - 32;
    }
    return left;
}

// Two hints in a row that would overlap are pushed apart: the one that follows the other
// at the same top moves right, at the same left moves down, until 20px clear.
export function nudgeHint(
    top: number, left: number, lastTop: number, lastLeft: number,
): { top: number; left: number } {
    if (top === lastTop && Math.abs(left - lastLeft) < 20) {
        left += 20 - Math.abs(left - lastLeft);
    } else if (left === lastLeft && Math.abs(top - lastTop) < 20) {
        top += 20 - Math.abs(top - lastTop);
    }
    return { top, left };
}

// The URL one `step` along from `href` by the first pattern that has the page number in
// group 2 (groups 1 and 3 are the text around it), or null when none does.
export function steppedPageUrl(href: string, patterns: readonly RegExp[], step: number): string | null {
    for (const pattern of patterns) {
        const numbers = href.match(pattern);
        if (numbers && numbers.length === 4) {
            const cp = parseInt(numbers[2]);
            if (cp < 0xffffffff) {
                return numbers[1] + (cp + step) + numbers[3];
            }
        }
    }
    return null;
}
