import { CORE_AGENT_ORDER, providerOptions } from "../../config/agent_config";
import type { DecisionStrategy, MatrixSectionKey, SectionMatrix, StrategicSectionTemplate, WorkflowEdge } from "./types";

const serializeSectionMatrix = (matrix: SectionMatrix): string => JSON.stringify(matrix);

export const CURRENCY_FORMATTER = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

export const REVIEW_ORDER = ["CEO", "CFO", "CTO", "Compliance"];
export const PROVIDER_OPTIONS = providerOptions();
export const CORE_AGENT_IDS = new Set<string>(CORE_AGENT_ORDER);

export const DECISION_STRATEGIES: DecisionStrategy[] = [
  {
    id: "307c618c",
    name: "Vel'Afrika Optimization",
    status: "Proposed",
    owner: "Facundo Rodriguez",
    reviewDate: "Feb 20, 2026",
    summary: "Optimize mobile conversion and basket size in high-intent categories to increase APGA by 20% over the next quarter.",
    primaryKpi: "APGA +20%",
    investment: "$120,000",
    strategicObjective: "Revenue Growth",
    confidence: "Medium",
  },
  {
    id: "458d92ef",
    name: "Global Logistics",
    status: "In Review",
    owner: "Sarah Jenkins",
    reviewDate: "Feb 18, 2026",
    summary: "Scale APAC fulfillment and cross-border routing to reduce delivery times in priority markets and improve repeat conversion.",
    primaryKpi: "Delivery Speed +40%",
    investment: "$850,000",
    strategicObjective: "Market Expansion",
    confidence: "High",
  },
  {
    id: "921f01bc",
    name: "AI-Powered Support Automation",
    status: "Approved",
    owner: "Marcus Thorne",
    reviewDate: "Jan 15, 2026",
    summary: "Deploy AI Tier-1 resolution agents to cut support load, improve SLA adherence, and free specialist teams for complex issues.",
    primaryKpi: "CSAT +15%",
    investment: "$45,000",
    strategicObjective: "Operational Efficiency",
    confidence: "Very High",
  },
  {
    id: "84ad22fe",
    name: "Storefront Margin Recovery",
    status: "Blocked",
    owner: "Dana Cortez",
    reviewDate: "Feb 11, 2026",
    summary: "Rebalance pricing and promotional depth to recover gross margin while protecting category-level conversion volume.",
    primaryKpi: "Gross Margin +4.5pp",
    investment: "$180,000",
    strategicObjective: "Profitability",
    confidence: "Low",
  },
];

export const OPTIONS_MATRIX_DEFAULT: SectionMatrix = {
  headers: ["Criteria", "Option A", "Option B", "Option C"],
  rows: [
    ["Option Name", "", "", ""],
    ["Revenue Impact", "", "", ""],
    ["Cost", "", "", ""],
    ["Risk Exposure", "", "", ""],
    ["Time to Market", "", "", ""],
    ["Strategic Leverage", "", "", ""],
  ],
};

export const RISK_MATRIX_DEFAULT: SectionMatrix = {
  headers: ["Risk", "Probability", "Impact", "Mitigation"],
  rows: [["", "", "", ""]],
};

export const STRATEGIC_OBJECTIVE_OPTIONS = [
  "Revenue Growth",
  "Margin Expansion",
  "Risk Reduction",
  "Market Expansion",
  "Operational Efficiency",
  "Regulatory Compliance",
  "Infrastructure Leverage",
];

export const TIME_HORIZON_OPTIONS = ["< 3 months", "3–6 months", "6–12 months", "12+ months"];

export const DECISION_TYPE_OPTIONS = ["Reversible", "Irreversible", "High-risk / High-reward", "Incremental Optimization"];

export const PROBABILITY_OPTIONS = ["90%", "75%", "60%", "40%", "20%"];

export const LEVERAGE_SCORE_OPTIONS = [
  "1 – Tactical Only",
  "2 – Segment Impact",
  "3 – Company-Level Impact",
  "4 – Platform Leverage",
  "5 – Long-Term Moat Creation",
];

export const REVERSIBILITY_OPTIONS = ["Fully Reversible", "Partially Reversible", "Hard to Reverse", "Irreversible"];

export const RISK_LEVEL_OPTIONS = ["None", "Low", "Medium", "High", "Critical"];

export const GOVERNANCE_CHECKLIST_ITEMS = [
  "Assumptions Logged",
  "Compliance Reviewed",
  "Decision Memo Written",
  "Downside Modeled",
  "Financial Model Included",
  "Kill Criteria Defined",
  "Leading Indicators Defined",
  "Option Trade-offs Explicit",
  "Problem Quantified",
  "Risk Matrix Completed",
  "Root Cause Done",
  "Strategic Alignment Brief",
  "Success Metrics Defined",
  "≥3 Options Evaluated",
];

export const STRATEGIC_ARTIFACT_SECTIONS: StrategicSectionTemplate[] = [
  {
    key: "executiveSummary",
    title: "Executive Summary",
    defaultValue: "One-paragraph decision rationale and expected impact.",
  },
  {
    key: "strategicContext",
    title: "Strategic Context",
    defaultValue: "- Objectives:\n- KPI impact:\n- Cost of inaction:",
  },
  {
    key: "problemFraming",
    title: "Problem Framing",
    defaultValue: "- Root cause:\n- Affected segments:\n- Quantified impact:",
  },
  {
    key: "optionsEvaluated",
    title: "Options Evaluated",
    defaultValue: serializeSectionMatrix(OPTIONS_MATRIX_DEFAULT),
  },
  {
    key: "financialModel",
    title: "Financial Model",
    defaultValue: "- 12-month revenue impact:\n- Margin effects:\n- Payback period:\n- Assumptions:",
  },
  {
    key: "riskMatrix",
    title: "Risk Matrix",
    defaultValue: serializeSectionMatrix(RISK_MATRIX_DEFAULT),
  },
  {
    key: "downsideModel",
    title: "Downside Model",
    defaultValue:
      "Scenario 1:\n- Failure mode:\n- Trigger:\n- Early warning signal:\n\nScenario 2:\n- Failure mode:\n- Trigger:\n- Early warning signal:\n\nScenario 3:\n- Failure mode:\n- Trigger:\n- Early warning signal:",
  },
  {
    key: "finalDecision",
    title: "Final Decision",
    defaultValue: "- Chosen option:\n- Explicit trade-offs:",
  },
  {
    key: "killCriteria",
    title: "Kill Criteria",
    defaultValue: "- KPI threshold breach:\n- Risk threshold breach:\n- Budget threshold breach:",
  },
  {
    key: "complianceMonitoring",
    title: "Compliance & Monitoring",
    defaultValue: "- Regulatory exposure:\n- Monitoring ownership:\n- Long-term metrics:",
  },
];

export const MATRIX_SECTIONS: Record<MatrixSectionKey, true> = {
  optionsEvaluated: true,
  riskMatrix: true,
};

export const EDGES: WorkflowEdge[] = [
  { id: "e1", source: "1", target: "2" },
  { id: "e2", source: "2", target: "3" },
  { id: "e3", source: "3", target: "4" },
  { id: "e4", source: "4", target: "5" },
  { id: "e5", source: "5", target: "6" },
];
