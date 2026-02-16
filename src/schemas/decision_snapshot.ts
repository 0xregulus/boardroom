export interface SectionExcerptItem {
  type: string;
  text: Record<string, unknown> & {
    content?: string;
  };
}

export interface ComputedFields {
  inferred_governance_checks: Record<string, boolean>;
  autochecked_governance_fields: string[];
}

export interface DecisionSnapshot {
  page_id: string;
  captured_at: string;
  properties: Record<string, unknown>;
  section_excerpt: SectionExcerptItem[];
  computed: ComputedFields;
}
