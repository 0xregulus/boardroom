export const DECISION_SOURCE_HEADINGS = [
  "Executive Summary",
  "1. Strategic Context",
  "2. Problem Framing",
  "3. Options Evaluated",
  "4. Financial Model",
  "5. Risk Matrix",
  "6. Final Decision",
  "7. Kill Criteria",
  "8. Monitoring Plan",
];

export const PRD_SECTION_DEFAULTS: Record<string, string> = {
  Goals: "Define the north star: outcomes, why now, tie to OKRs.",
  Background: "Context: prior decisions, customer insights, incidents, gaps.",
  Research: "Market scans, competitive benchmarks, and evidence.",
  "User Stories": "Use: \"As a [user], I want [action], so I can [benefit].\"",
  Requirements: "Functional, non-functional, and constraints. Make them testable.",
  Telemetry: "Events, properties, funnels, KPIs, dashboards, and review cadence.",
  "UX/UI Design": "Capture UX flows, accessibility, and responsive design notes.",
  Experiment: "Hypothesis, KPIs, success/fail criteria, and sampling plan.",
  "Q&A": "Open questions, blockers, and dependencies.",
  Notes: "Assumptions, pending decisions, and implementation notes.",
};
