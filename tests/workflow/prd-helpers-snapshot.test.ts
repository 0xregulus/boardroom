import { describe, expect, it } from "vitest";

import { extractDecisionSection, propertyValue, sectionLines, snapshotBodyText } from "../../src/workflow/prd_helpers";
import type { WorkflowState } from "../../src/workflow/states";

function stateWithExcerpt(content: unknown): WorkflowState {
  return {
    decision_snapshot: {
      section_excerpt: [
        {
          type: "text",
          text: {
            content,
          },
        },
      ],
    },
  } as unknown as WorkflowState;
}

describe("workflow/prd_helpers/snapshot", () => {
  it("extracts primitive and typed property values", () => {
    expect(propertyValue({ owner: "Alex" }, "owner")).toBe("Alex");
    expect(propertyValue({ count: 12 }, "count")).toBe("12");
    expect(propertyValue({ ratio: 1.25 }, "ratio")).toBe("1.25");
    expect(propertyValue({ approved: true }, "approved")).toBe("Yes");
    expect(propertyValue({ approved: false }, "approved")).toBe("No");

    expect(
      propertyValue(
        {
          titleField: { type: "title", title: [{ plain_text: "Boardroom " }, { plain_text: "Decision" }] },
        },
        "titleField",
      ),
    ).toBe("Boardroom Decision");

    expect(
      propertyValue(
        {
          richField: { type: "rich_text", rich_text: [{ plain_text: "Needs " }, { plain_text: "review" }] },
        },
        "richField",
      ),
    ).toBe("Needs review");

    expect(propertyValue({ numField: { type: "number", number: 50 } }, "numField")).toBe("50");
    expect(propertyValue({ numField: { type: "number", number: null } }, "numField")).toBe("");
    expect(propertyValue({ selectField: { type: "select", select: { name: "High" } } }, "selectField")).toBe("High");
    expect(propertyValue({ statusField: { type: "status", status: { name: "In Review" } } }, "statusField")).toBe("In Review");
    expect(propertyValue({ checkField: { type: "checkbox", checkbox: true } }, "checkField")).toBe("Yes");
    expect(propertyValue({ urlField: { type: "url", url: "https://example.com" } }, "urlField")).toBe("https://example.com");
    expect(propertyValue({ emailField: { type: "email", email: "owner@example.com" } }, "emailField")).toBe("owner@example.com");
    expect(propertyValue({ unsupported: { type: "relation" } }, "unsupported")).toBe("");
    expect(propertyValue({ list: [1, 2, 3] }, "list")).toBe("");
  });

  it("extracts body text from first snapshot excerpt safely", () => {
    expect(snapshotBodyText({} as WorkflowState)).toBe("");
    expect(snapshotBodyText({ decision_snapshot: { section_excerpt: [] } } as unknown as WorkflowState)).toBe("");
    expect(snapshotBodyText({ decision_snapshot: { section_excerpt: [null] } } as unknown as WorkflowState)).toBe("");
    expect(snapshotBodyText(stateWithExcerpt("Narrative content"))).toBe("Narrative content");
    expect(snapshotBodyText(stateWithExcerpt(123))).toBe("");
  });

  it("extracts a section until the next known heading", () => {
    const bodyText = `
1. Strategic Context
We are pursuing a margin expansion strategy.
2. Problem Framing
Current conversion is below target.
3. Options Evaluated
Option A
Option B
`;

    expect(extractDecisionSection(bodyText, "1. Strategic Context")).toContain("margin expansion");
    expect(extractDecisionSection(bodyText, "2. Problem Framing")).toBe("Current conversion is below target.");
    expect(extractDecisionSection(bodyText, "Missing Heading")).toBe("");
  });

  it("supports inline heading content when no newline follows the heading", () => {
    const bodyText = "8. Monitoring Plan Primary metric is conversion health.";
    const extracted = extractDecisionSection(bodyText, "8. Monitoring Plan");

    expect(extracted).toBe("Primary metric is conversion health.");
  });

  it("normalizes section lines, removes labels, dedupes, and applies limits", () => {
    expect(sectionLines("")).toEqual([]);
    expect(sectionLines("Label only:")).toEqual([]);

    const lines = sectionLines(
      "Option A\noption a\nRequired changes:\nTrack conversion weekly\nTrack conversion weekly\nAnother line",
      2,
    );

    expect(lines).toEqual(["Track conversion weekly", "Another line"]);
    expect(sectionLines("Sentence one. Sentence two? Sentence three!", 2)).toEqual(["Sentence one.", "Sentence two?"]);
  });
});
