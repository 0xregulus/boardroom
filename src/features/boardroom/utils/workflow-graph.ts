import { REVIEW_ORDER } from "../constants";
import type { NodePosition, StrategyStatus, WorkflowNode, WorkflowTask } from "../types";

export function buildReviewTasks(reviewRoles: string[]): WorkflowTask[] {
  const counts = new Map<string, number>();

  return reviewRoles.map((rawRole, index) => {
    const title = rawRole.trim().length > 0 ? rawRole.trim() : `Agent ${index + 1}`;
    const baseId =
      title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/(^-|-$)/g, "") || `agent-${index + 1}`;
    const currentCount = (counts.get(baseId) ?? 0) + 1;
    counts.set(baseId, currentCount);
    const id = currentCount > 1 ? `${baseId}-${currentCount}` : baseId;

    return {
      id,
      title,
      status: "IDLE",
    };
  });
}

export function buildInteractionTasks(interactionRounds: number): WorkflowTask[] {
  const normalized = Math.max(0, Math.min(5, Math.round(interactionRounds)));
  const tasks: WorkflowTask[] = [];

  for (let round = 1; round <= normalized; round += 1) {
    tasks.push({
      id: `interaction-round-${round}`,
      title: `Round ${round}`,
      status: "IDLE",
    });
  }

  return tasks;
}

export function buildInitialNodes(
  strategyName?: string | null,
  reviewRoles: string[] = REVIEW_ORDER,
  interactionRounds = 1,
): WorkflowNode[] {
  const inputSubtitle = strategyName ? strategyName : "No Strategy Selected";
  const interactionTasks = buildInteractionTasks(interactionRounds);
  const interactionSubtitle =
    interactionTasks.length > 0
      ? `${interactionTasks.length} rebuttal round${interactionTasks.length === 1 ? "" : "s"}`
      : "Rebuttal disabled";

  return [
    {
      id: "1",
      type: "INPUT",
      title: "Strategic Context",
      subtitle: inputSubtitle,
      position: { x: 40, y: 96 },
      status: "IDLE",
    },
    {
      id: "2",
      type: "STRATEGY",
      title: "Drafting Doc",
      subtitle: "Strategic memo",
      position: { x: 300, y: 96 },
      status: "IDLE",
    },
    {
      id: "3",
      type: "REVIEW",
      title: "Parallel Reviewers",
      subtitle: "CEO, CFO, CTO, Compliance",
      position: { x: 560, y: 96 },
      status: "IDLE",
      tasks: buildReviewTasks(reviewRoles),
    },
    {
      id: "4",
      type: "INTERACTION",
      title: "Cross-Agent Rebuttal",
      subtitle: interactionSubtitle,
      position: { x: 820, y: 96 },
      status: "IDLE",
      tasks: interactionTasks,
    },
    {
      id: "5",
      type: "SYNTHESIS",
      title: "Feedback Synthesis",
      subtitle: "Quality scoring",
      position: { x: 1080, y: 96 },
      status: "IDLE",
    },
    {
      id: "6",
      type: "PRD",
      title: "Generate PRD",
      subtitle: "Execution document",
      position: { x: 1340, y: 96 },
      status: "IDLE",
    },
    {
      id: "7",
      type: "PERSIST",
      title: "DB Persist",
      subtitle: "Persist artifacts",
      position: { x: 1600, y: 96 },
      status: "IDLE",
    },
  ];
}

export function strategyStatusTone(status: StrategyStatus): "proposed" | "review" | "approved" | "blocked" {
  if (status === "Approved") {
    return "approved";
  }
  if (status === "Blocked") {
    return "blocked";
  }
  if (status === "In Review") {
    return "review";
  }
  return "proposed";
}

export function edgePathData(start: NodePosition, end: NodePosition): string {
  const x1 = start.x + 220;
  const y1 = start.y + 40;
  const x2 = end.x;
  const y2 = end.y + 40;
  return `M ${x1} ${y1} L ${x2} ${y2}`;
}
