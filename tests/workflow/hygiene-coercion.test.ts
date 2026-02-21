import { describe, expect, it } from "vitest";

import {
  asRecord,
  cleanText,
  getSnapshotBodyText,
  includesAny,
  parseNumber,
  parsePercent,
} from "../../src/workflow/hygiene/coercion";

describe("workflow/hygiene/coercion", () => {
  it("normalizes object-like and text-like values", () => {
    expect(asRecord({ a: 1 })).toEqual({ a: 1 });
    expect(asRecord([])).toBeNull();
    expect(asRecord(null)).toBeNull();

    expect(cleanText("  hello  ")).toBe("hello");
    expect(cleanText(123)).toBe("");
  });

  it("parses numeric values from primitives and nested records", () => {
    expect(parseNumber(42)).toBe(42);
    expect(parseNumber(" 1,250 ")).toBe(1250);
    expect(parseNumber({ number: "99" })).toBe(99);
    expect(parseNumber({ value: "12.5" })).toBe(12.5);
    expect(parseNumber({ amount: "$1,010" })).toBe(1010);
    expect(parseNumber("not-a-number")).toBeNull();
    expect(parseNumber({})).toBeNull();
  });

  it("parses percent values from numbers, strings, and select-like records", () => {
    expect(parsePercent(0.35)).toBe(35);
    expect(parsePercent(80)).toBe(80);
    expect(parsePercent("42%")).toBe(42);
    expect(parsePercent("0.2")).toBe(20);
    expect(parsePercent({ select: "71%" })).toBe(71);
    expect(parsePercent({ name: "0.5" })).toBe(50);
    expect(parsePercent("unknown")).toBeNull();
    expect(parsePercent({})).toBeNull();
  });

  it("extracts body text from snapshot excerpt entries safely", () => {
    const snapshot = {
      section_excerpt: [
        { text: { content: "  First line  " } },
        { text: { content: "Second line" } },
        { text: { content: 123 } },
        null,
      ],
    } as any;

    expect(getSnapshotBodyText(null)).toBe("");
    expect(getSnapshotBodyText({ section_excerpt: "nope" } as any)).toBe("");
    expect(getSnapshotBodyText(snapshot)).toBe("First line\nSecond line");
  });

  it("matches needles by tokens and fallback behavior", () => {
    expect(includesAny("market expansion plan", "")).toBe(true);
    expect(includesAny("q3 runway", "q3")).toBe(true);
    expect(includesAny("probability of success improved", "success probability")).toBe(true);
    expect(includesAny("operating margin", "compliance")).toBe(false);
  });
});
