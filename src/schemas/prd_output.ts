export interface PRDOutput {
  title: string;
  scope: string[];
  milestones: string[];
  telemetry: string[];
  risks: string[];
  sections: Record<string, string[]>;
}
