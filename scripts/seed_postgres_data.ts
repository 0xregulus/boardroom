import type { PRDOutput } from "../src/schemas/prd_output";
import type { ReviewOutput } from "../src/schemas/review_output";
import { GOVERNANCE_CHECKBOX_FIELDS, REQUIRED_BOOLEAN_GATES } from "../src/workflow/gates";
import type { ChairpersonSynthesis } from "../src/workflow/states";

interface SeedOutputs {
  reviews: Record<string, ReviewOutput>;
  synthesis: ChairpersonSynthesis;
  prd: PRDOutput;
  workflowRun: {
    dqs: number;
    gateDecision: string;
    workflowStatus: string;
    state: Record<string, unknown>;
  };
}

export interface SeedDecision {
  id: string;
  name: string;
  status: string;
  owner: string;
  reviewDate: string;
  summary: string;
  primaryKpi: string;
  investmentRequired: number;
  strategicObjective: string;
  confidence: string;
  baseline: number;
  target: number;
  timeHorizon: string;
  probabilityOfSuccess: string;
  leverageScore: string;
  riskAdjustedRoi: number;
  benefit12mGross: number;
  decisionType: string;
  detailsUrl: string;
  bodyText: string;
  governanceChecks: Record<string, boolean>;
  outputs?: SeedOutputs;
}

const ALL_GATES = [...new Set([...REQUIRED_BOOLEAN_GATES, ...GOVERNANCE_CHECKBOX_FIELDS])];

function isoDateFromNow(daysFromToday: number): string {
  const value = new Date();
  value.setUTCDate(value.getUTCDate() + daysFromToday);
  return value.toISOString();
}

function fullGateMap(defaultValue = false): Record<string, boolean> {
  const checks: Record<string, boolean> = {};
  for (const gate of ALL_GATES) {
    checks[gate] = defaultValue;
  }
  return checks;
}

function setGateByContains(checks: Record<string, boolean>, marker: string, value: boolean): void {
  const gateName = ALL_GATES.find((gate) => gate.toLowerCase().includes(marker.toLowerCase()));
  if (gateName) {
    checks[gateName] = value;
  }
}

function buildChecks(
  enabledMarkers: string[],
  defaults: Partial<Record<"requiredGates", boolean>> = { requiredGates: true },
): Record<string, boolean> {
  const checks = fullGateMap(false);

  if (defaults.requiredGates) {
    for (const gate of REQUIRED_BOOLEAN_GATES) {
      checks[gate] = true;
    }
  }

  for (const marker of enabledMarkers) {
    setGateByContains(checks, marker, true);
  }

  return checks;
}

function review(
  agent: string,
  thesis: string,
  score: number,
  confidence: number,
  blocked: boolean,
  extra: {
    blockers?: string[];
    risks?: Array<{ type: string; severity: number; evidence: string }>;
    requiredChanges?: string[];
    approvalConditions?: string[];
  } = {},
): ReviewOutput {
  return {
    agent,
    thesis,
    score,
    confidence,
    blocked,
    blockers: extra.blockers ?? [],
    risks: extra.risks ?? [],
    required_changes: extra.requiredChanges ?? [],
    approval_conditions: extra.approvalConditions ?? [],
    apga_impact_view: blocked ? "Near-term APGA protection; growth delayed pending corrective actions." : "Positive APGA impact expected within one quarter.",
    governance_checks_met: {},
  };
}

function bodyTextForScenario(
  summary: string,
  context: string,
  problem: string,
  options: string,
  financial: string,
  riskMatrix: string,
  downside: string,
  finalDecision: string,
  killCriteria: string,
  compliance: string,
): string {
  return `
Executive Summary
${summary}

1. Strategic Context
${context}

2. Problem Framing
${problem}

3. Options Evaluated
${options}

4. Financial Model
${financial}

5. Risk Matrix
${riskMatrix}

6. Downside Model
${downside}

7. Final Decision
${finalDecision}

8. Kill Criteria
${killCriteria}

10. Compliance & Monitoring
${compliance}
`.trim();
}

export const SEED_DECISIONS: SeedDecision[] = [
  {
    id: "seed-mobile-checkout-001",
    name: "Mobile Checkout Optimization Program",
    status: "Proposed",
    owner: "Growth PMO",
    reviewDate: isoDateFromNow(14),
    summary: "Increase mobile checkout conversion and APGA through faster payment flows and cart friction reduction.",
    primaryKpi: "Mobile CVR +18%",
    investmentRequired: 120000,
    strategicObjective: "Revenue Growth",
    confidence: "Medium",
    baseline: 2.4,
    target: 2.83,
    timeHorizon: "Q2 2026",
    probabilityOfSuccess: "68%",
    leverageScore: "4/5",
    riskAdjustedRoi: 2.1,
    benefit12mGross: 420000,
    decisionType: "Growth Initiative",
    detailsUrl: "https://example.com/decisions/mobile-checkout",
    bodyText: bodyTextForScenario(
      "Lift mobile checkout conversion by reducing payment friction in high-intent sessions.",
      "Strategic alignment with direct growth objective in North America.",
      "Problem quantified: mobile conversion lags desktop by 1.6 points and impacts quarterly revenue.",
      "Option A: optimize saved cards, Option B: one-click wallets, Option C: guest checkout defaults. Trade-offs and owner impacts are explicit.",
      "Financial model estimates +$420k 12-month benefit with payback in 4 months.",
      "Risk matrix includes probability and impact ranges with mitigations for payment reliability and fraud.",
      "Downside modeled at 30% adoption with reduced ROI and staged rollout controls.",
      "Recommend phased rollout with weekly KPI and leading indicator checks.",
      "Kill criteria: stop if conversion lift is below 4% after 6 weeks.",
      "Compliance reviewed with legal and payments teams; monitoring plan includes incident thresholds.",
    ),
    governanceChecks: buildChecks(["trade-offs", "risk matrix", "financial model", "downside", "compliance", "root cause", "assumptions"]),
  },
  {
    id: "seed-fulfillment-routing-002",
    name: "Regional Fulfillment Routing Automation",
    status: "Proposed",
    owner: "Operations",
    reviewDate: isoDateFromNow(10),
    summary: "Automate cross-region routing to lower shipping delays while preserving margin.",
    primaryKpi: "On-time Delivery +15%",
    investmentRequired: 310000,
    strategicObjective: "Operational Efficiency",
    confidence: "Medium",
    baseline: 81,
    target: 93,
    timeHorizon: "Q3 2026",
    probabilityOfSuccess: "61%",
    leverageScore: "3/5",
    riskAdjustedRoi: 1.5,
    benefit12mGross: 520000,
    decisionType: "Operations Program",
    detailsUrl: "https://example.com/decisions/fulfillment-routing",
    bodyText: bodyTextForScenario(
      "Reduce delivery variance using rule-based routing and carrier fallback logic.",
      "Supports reliability objective and repeat-purchase growth in key markets.",
      "Problem quantified through missed SLA rates and shipping cost volatility.",
      "Option A: in-house rules engine, Option B: carrier aggregator, Option C: hybrid strategy.",
      "Financial model includes implementation, carrier, and support cost envelopes.",
      "Risk matrix has mitigation plans for outage, data lag, and exception handling.",
      "Downside scenario assumes peak-season latency and lower than expected adoption.",
      "Proceed with hybrid approach and two-region pilot before broader rollout.",
      "Kill criteria: halt expansion if SLA misses exceed baseline for 3 consecutive weeks.",
      "Compliance reviewed for data retention and cross-border shipping policy.",
    ),
    governanceChecks: buildChecks(["trade-offs", "financial model", "risk matrix", "decision memo", "assumptions"]),
  },
  {
    id: "seed-support-copilot-003",
    name: "Support Copilot Rollout",
    status: "Under Evaluation",
    owner: "Customer Operations",
    reviewDate: isoDateFromNow(5),
    summary: "Deploy an internal AI copilot for Tier-1 support to reduce response time and improve first-contact resolution.",
    primaryKpi: "FCR +12%",
    investmentRequired: 180000,
    strategicObjective: "Service Quality",
    confidence: "High",
    baseline: 64,
    target: 76,
    timeHorizon: "Q2 2026",
    probabilityOfSuccess: "72%",
    leverageScore: "4/5",
    riskAdjustedRoi: 1.9,
    benefit12mGross: 390000,
    decisionType: "AI Enablement",
    detailsUrl: "https://example.com/decisions/support-copilot",
    bodyText: bodyTextForScenario(
      "Accelerate support throughput and quality with guided response suggestions.",
      "Strategic context ties to retention and customer trust outcomes.",
      "Problem quantified using queue backlog, SLA misses, and escalation rates.",
      "Option A: knowledge retrieval only, Option B: draft responses, Option C: fully assisted workflows.",
      "Financial model projects staffing reallocation and reduced handling time.",
      "Risk matrix identifies hallucination, policy drift, and escalation bypass risks.",
      "Downside modeled for low adoption and elevated review overhead.",
      "Recommendation is a guarded rollout with daily QA review and staged privileges.",
      "Kill criteria: rollback if policy violation rate exceeds 1.5% for two weeks.",
      "Compliance reviewed with audit logging, PII filtering, and sampling controls.",
    ),
    governanceChecks: buildChecks(["trade-offs", "financial model", "risk matrix", "compliance", "decision memo", "assumptions", "leading indicators"]),
  },
  {
    id: "seed-ai-assist-approved-004",
    name: "AI Tier-1 Resolution Assistant",
    status: "Approved",
    owner: "Support Engineering",
    reviewDate: isoDateFromNow(-7),
    summary: "AI-assisted Tier-1 resolution achieved pilot targets and is approved for phased production rollout.",
    primaryKpi: "SLA Breaches -25%",
    investmentRequired: 95000,
    strategicObjective: "Cost and Quality",
    confidence: "High",
    baseline: 22,
    target: 16,
    timeHorizon: "Q1 2026",
    probabilityOfSuccess: "79%",
    leverageScore: "5/5",
    riskAdjustedRoi: 2.7,
    benefit12mGross: 460000,
    decisionType: "AI Enablement",
    detailsUrl: "https://example.com/decisions/tier1-assistant",
    bodyText: bodyTextForScenario(
      "Pilot outcomes exceeded SLA and quality targets; move to controlled production rollout.",
      "Strategic context aligns with margin protection and customer satisfaction priorities.",
      "Problem quantified via backlog cost and inconsistent resolution quality.",
      "Option A: status quo, Option B: copilot only, Option C: copilot plus routing assist.",
      "Financial model indicates favorable payback within one quarter.",
      "Risk matrix includes model drift, data leakage, and quality regression mitigations.",
      "Downside model validates fallback process if response quality drops.",
      "Final decision is Approved with phased deployment and weekly governance checkpoints.",
      "Kill criteria: pause rollout if QA precision drops below 93%.",
      "Compliance reviewed and signed off with monitoring and alert thresholds.",
    ),
    governanceChecks: buildChecks(["trade-offs", "risk matrix", "financial model", "downside", "compliance", "decision memo", "root cause", "assumptions"]),
    outputs: {
      reviews: {
        CEO: review("CEO", "Strategically sound and directly tied to APGA and retention outcomes.", 8, 0.83, false, {
          requiredChanges: ["Expand benchmark tracking to include churn cohorts."],
          approvalConditions: ["Publish monthly variance analysis for SLA and CSAT."],
        }),
        CFO: review("CFO", "Economics are compelling with a short payback period and clear downside controls.", 9, 0.86, false, {
          requiredChanges: ["Maintain a weekly cost-to-serve dashboard."],
          approvalConditions: ["Keep pilot-to-production hiring flat."],
        }),
        CTO: review("CTO", "Architecture and guardrails are production-ready for phased scale.", 8, 0.82, false, {
          requiredChanges: ["Finish load-test suite for peak periods."],
          risks: [{ type: "model_drift", severity: 5, evidence: "Prompt behavior may shift after model updates." }],
        }),
        Compliance: review("Compliance", "Control design and auditing are acceptable for expanded deployment.", 8, 0.81, false, {
          approvalConditions: ["Quarterly review of redaction and retention policies."],
          risks: [{ type: "policy_adherence", severity: 4, evidence: "Additional monitoring required for edge-case escalations." }],
        }),
      },
      synthesis: {
        executive_summary: "Board review indicates strong strategic fit, manageable risk, and favorable economics for a phased rollout.",
        final_recommendation: "Approved",
        conflicts: [],
        blockers: [],
        required_revisions: ["Add cohort-level retention reporting to monthly governance packet."],
      },
      prd: {
        title: "AI Tier-1 Resolution Assistant PRD",
        scope: ["Phase 1 for English support queues", "Agent-facing suggestions and response drafting"],
        milestones: ["Week 1: Launch to 20% queue volume", "Week 4: Expand to 60% with quality gate", "Week 8: Full Tier-1 coverage"],
        telemetry: ["First-contact resolution rate", "Average handling time", "Policy violation rate", "Escalation rate"],
        risks: ["Model drift", "Knowledge-base staleness", "False confidence in suggested responses"],
        sections: {
          objectives: ["Reduce SLA breaches by 25%", "Improve first-contact resolution by 12%"],
          rollout: ["Start with controlled cohorts", "Use weekly release criteria tied to QA metrics"],
        },
      },
      workflowRun: {
        dqs: 8.3,
        gateDecision: "approved",
        workflowStatus: "PERSISTED",
        state: {
          decision_id: "seed-ai-assist-approved-004",
          decision_name: "AI Tier-1 Resolution Assistant",
          status: "PERSISTED",
          dqs: 8.3,
          missing_sections: [],
        },
      },
    },
  },
  {
    id: "seed-pricing-recovery-005",
    name: "Storefront Margin Recovery Plan",
    status: "Blocked",
    owner: "Merchandising",
    reviewDate: isoDateFromNow(-3),
    summary: "Margin recovery strategy is blocked pending stronger risk controls for conversion decline.",
    primaryKpi: "Gross Margin +4.5pp",
    investmentRequired: 150000,
    strategicObjective: "Profitability",
    confidence: "Low",
    baseline: 41.2,
    target: 45.7,
    timeHorizon: "Q2 2026",
    probabilityOfSuccess: "42%",
    leverageScore: "2/5",
    riskAdjustedRoi: 0.8,
    benefit12mGross: 190000,
    decisionType: "Pricing Strategy",
    detailsUrl: "https://example.com/decisions/margin-recovery",
    bodyText: bodyTextForScenario(
      "Recover margin through pricing and promotion changes in constrained categories.",
      "Strategic context supports profitability but conflicts with near-term growth expectations.",
      "Problem quantified through erosion in gross margin and discount dependency.",
      "Option A: broad price increases, Option B: selective category reprice, Option C: promo-depth controls.",
      "Financial model shows potential upside but high sensitivity to conversion loss.",
      "Risk matrix flags elevated customer churn and competitor response risk.",
      "Downside scenario projects significant revenue contraction under weak elasticity assumptions.",
      "Final decision is deferred pending tighter safeguards and test design.",
      "Kill criteria: stop policy if conversion drops more than 7% in pilot cohorts.",
      "Compliance review requires improved customer communication and fairness checks.",
    ),
    governanceChecks: buildChecks(["trade-offs", "risk matrix", "financial model", "downside", "decision memo"]),
    outputs: {
      reviews: {
        CEO: review("CEO", "Strategic upside exists, but execution risk is too high for broad rollout.", 5, 0.72, false, {
          requiredChanges: ["Narrow pilot scope to one category and one region."],
        }),
        CFO: review("CFO", "Risk-adjusted return is currently below threshold given downside volatility.", 4, 0.75, true, {
          blockers: ["Sensitivity analysis is too coarse for approval."],
          requiredChanges: ["Provide elasticity bands by cohort."],
          risks: [{ type: "demand_elasticity", severity: 8, evidence: "Projected margin gain disappears in moderate-demand decline scenarios." }],
        }),
        CTO: review("CTO", "Implementation path is clear, but telemetry is insufficient for early risk detection.", 5, 0.69, false, {
          requiredChanges: ["Add near-real-time conversion anomaly detection."],
        }),
        Compliance: review("Compliance", "Customer fairness and disclosure controls are incomplete.", 4, 0.74, true, {
          blockers: ["Insufficient disclosure plan for price and promotion shifts."],
          requiredChanges: ["Define customer communication and exception handling policy."],
          risks: [{ type: "fairness_and_disclosure", severity: 7, evidence: "Policy language does not cover high-impact customer segments." }],
        }),
      },
      synthesis: {
        executive_summary: "Board review identified unresolved financial and compliance blockers, so the proposal is blocked.",
        final_recommendation: "Blocked",
        conflicts: ["Finance requests narrower pilots while growth prefers faster rollout."],
        blockers: ["Insufficient elasticity granularity", "Incomplete compliance disclosure controls"],
        required_revisions: ["Deliver segmented elasticity model", "Publish disclosure and exception policy"],
      },
      prd: {
        title: "Storefront Margin Recovery PRD",
        scope: ["Single-category pilot", "Price and promo-depth adjustment rules"],
        milestones: ["Week 1: Instrumentation baseline", "Week 3: Controlled pilot launch", "Week 6: Risk review checkpoint"],
        telemetry: ["Conversion rate", "Gross margin", "Discount depth", "Customer complaint rate"],
        risks: ["Demand elasticity uncertainty", "Competitive repricing", "Brand trust impact"],
        sections: {
          guardrails: ["Auto-stop when conversion drops >7%", "Weekly compliance and finance sign-off"],
        },
      },
      workflowRun: {
        dqs: 4.6,
        gateDecision: "blocked",
        workflowStatus: "PERSISTED",
        state: {
          decision_id: "seed-pricing-recovery-005",
          decision_name: "Storefront Margin Recovery Plan",
          status: "PERSISTED",
          dqs: 4.6,
          missing_sections: [],
        },
      },
    },
  },
];
