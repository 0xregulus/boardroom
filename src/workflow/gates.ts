export const GOVERNANCE_CHECKBOX_FIELDS = [
  "≥3 Options Evaluated",
  "Success Metrics Defined",
  "Leading Indicators Defined",
  "Kill Criteria Defined",
  "Option Trade-offs Explicit",
  "Risk Matrix Completed",
  "Financial Model Included",
  "Downside Modeled",
  "Compliance Reviewed",
  "Decision Memo Written",
  "Root Cause Done",
  "Assumptions Logged",
];

export const REQUIRED_BOOLEAN_GATES = [
  "Strategic Alignment Brief",
  "Problem Quantified",
  "≥3 Options Evaluated",
  "Success Metrics Defined",
  "Leading Indicators Defined",
  "Kill Criteria Defined",
];

function checkboxTrue(prop: unknown): boolean {
  if (typeof prop === "boolean") {
    return prop;
  }

  if (!prop || typeof prop !== "object" || Array.isArray(prop)) {
    return false;
  }

  const record = prop as Record<string, unknown>;
  return Boolean(record.checkbox);
}

function numberPresent(prop: unknown): boolean {
  if (typeof prop === "number" && Number.isFinite(prop)) {
    return true;
  }

  if (!prop || typeof prop !== "object" || Array.isArray(prop)) {
    return false;
  }

  const record = prop as Record<string, unknown>;
  if (typeof record.number === "number" && Number.isFinite(record.number)) {
    return true;
  }

  return false;
}

function selectPresent(prop: unknown): boolean {
  if (typeof prop === "string") {
    return prop.trim().length > 0;
  }

  if (!prop || typeof prop !== "object" || Array.isArray(prop)) {
    return false;
  }

  const record = prop as Record<string, unknown>;
  const select = record.select as Record<string, unknown> | null | undefined;
  if (typeof select?.name === "string" && select.name.trim().length > 0) {
    return true;
  }

  const status = record.status as Record<string, unknown> | null | undefined;
  if (typeof status?.name === "string" && status.name.trim().length > 0) {
    return true;
  }

  if (typeof record.name === "string" && record.name.trim().length > 0) {
    return true;
  }

  return false;
}

export function inferGovernanceChecksFromText(bodyText: string): Record<string, boolean> {
  const text = bodyText.toLowerCase();

  const hasAny = (...phrases: string[]): boolean => phrases.some((phrase) => text.includes(phrase));
  const explicitlyNo = (gateName: string): boolean => text.includes(`${gateName.toLowerCase()}: no`);

  const optionMatches = text.match(/\boption\s+[a-z0-9]+\b/g) ?? [];
  const numericMatches = text.match(/\b\d[\d,.%]*\b/g) ?? [];

  return {
    "Strategic Alignment Brief": !explicitlyNo("Strategic Alignment Brief") && hasAny("strategic context", "strategic alignment", "objective supported"),
    "Problem Quantified":
      !explicitlyNo("Problem Quantified") &&
      hasAny("problem framing", "quantified impact", "problem statement") &&
      numericMatches.length >= 3,
    "≥3 Options Evaluated":
      !explicitlyNo("≥3 Options Evaluated") &&
      hasAny("options evaluated", "chosen option") &&
      new Set(optionMatches).size >= 3,
    "Success Metrics Defined": !explicitlyNo("Success Metrics Defined") && hasAny("success metrics", "primary metric", "kpi impact"),
    "Leading Indicators Defined": !explicitlyNo("Leading Indicators Defined") && hasAny("leading indicators"),
    "Kill Criteria Defined": !explicitlyNo("Kill Criteria Defined") && hasAny("kill criteria", "we will stop or pivot"),
    "Option Trade-offs Explicit": !explicitlyNo("Option Trade-offs Explicit") && hasAny("trade-offs", "trade offs"),
    "Risk Matrix Completed":
      !explicitlyNo("Risk Matrix Completed") && hasAny("risk matrix") && hasAny("mitigation", "probability", "impact"),
    "Financial Model Included":
      !explicitlyNo("Financial Model Included") && hasAny("financial model", "payback period", "revenue impact", "cost impact"),
    "Downside Modeled": !explicitlyNo("Downside Modeled") && hasAny("downside", "risk-adjusted", "sensitivity"),
    "Compliance Reviewed":
      !explicitlyNo("Compliance Reviewed") && hasAny("compliance review", "compliance reviewed", "legal review", "regulatory review"),
    "Decision Memo Written": !explicitlyNo("Decision Memo Written") && hasAny("executive summary", "final decision"),
    "Root Cause Done": !explicitlyNo("Root Cause Done") && hasAny("root cause"),
    "Assumptions Logged": !explicitlyNo("Assumptions Logged") && hasAny("assumptions", "confidence level"),
  };
}

export function evaluateRequiredGates(
  pageProperties: Record<string, unknown>,
  inferredChecks: Record<string, boolean> | null = null,
): string[] {
  const missing: string[] = [];

  if (!numberPresent(pageProperties.Baseline as Record<string, unknown> | null | undefined)) {
    missing.push("Baseline");
  }

  if (!numberPresent(pageProperties.Target as Record<string, unknown> | null | undefined)) {
    missing.push("Target");
  }

  if (!selectPresent(pageProperties["Time Horizon"] as Record<string, unknown> | null | undefined)) {
    missing.push("Time Horizon");
  }

  for (const gate of REQUIRED_BOOLEAN_GATES) {
    const checkboxSet = checkboxTrue(pageProperties[gate] as Record<string, unknown> | null | undefined);
    const inferredSet = Boolean(inferredChecks?.[gate]);
    if (!checkboxSet && !inferredSet) {
      missing.push(gate);
    }
  }

  return missing;
}
