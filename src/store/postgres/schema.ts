export const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS decisions (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'Proposed',
  owner TEXT,
  review_date TIMESTAMPTZ,
  summary TEXT,
  primary_kpi TEXT,
  investment_required NUMERIC,
  strategic_objective TEXT,
  confidence TEXT,
  baseline NUMERIC,
  target NUMERIC,
  time_horizon TEXT,
  probability_of_success TEXT,
  leverage_score TEXT,
  risk_adjusted_roi NUMERIC,
  benefit_12m_gross NUMERIC,
  decision_type TEXT,
  mitigations JSONB NOT NULL DEFAULT '[]'::jsonb,
  details_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS decision_documents (
  decision_id TEXT PRIMARY KEY REFERENCES decisions(id) ON DELETE CASCADE,
  body_text TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS decision_governance_checks (
  decision_id TEXT NOT NULL REFERENCES decisions(id) ON DELETE CASCADE,
  gate_name TEXT NOT NULL,
  is_checked BOOLEAN NOT NULL DEFAULT FALSE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (decision_id, gate_name)
);

CREATE TABLE IF NOT EXISTS decision_reviews (
  decision_id TEXT NOT NULL REFERENCES decisions(id) ON DELETE CASCADE,
  agent_name TEXT NOT NULL,
  thesis TEXT NOT NULL,
  score INTEGER NOT NULL CHECK (score >= 1 AND score <= 10),
  confidence NUMERIC NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
  blocked BOOLEAN NOT NULL DEFAULT FALSE,
  blockers JSONB NOT NULL DEFAULT '[]'::jsonb,
  risks JSONB NOT NULL DEFAULT '[]'::jsonb,
  citations JSONB NOT NULL DEFAULT '[]'::jsonb,
  required_changes JSONB NOT NULL DEFAULT '[]'::jsonb,
  approval_conditions JSONB NOT NULL DEFAULT '[]'::jsonb,
  apga_impact_view TEXT NOT NULL DEFAULT '',
  governance_checks_met JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (decision_id, agent_name)
);

CREATE TABLE IF NOT EXISTS decision_synthesis (
  decision_id TEXT PRIMARY KEY REFERENCES decisions(id) ON DELETE CASCADE,
  executive_summary TEXT NOT NULL,
  final_recommendation TEXT NOT NULL,
  conflicts JSONB NOT NULL DEFAULT '[]'::jsonb,
  blockers JSONB NOT NULL DEFAULT '[]'::jsonb,
  required_revisions JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS decision_prds (
  decision_id TEXT PRIMARY KEY REFERENCES decisions(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'Draft',
  scope JSONB NOT NULL DEFAULT '[]'::jsonb,
  milestones JSONB NOT NULL DEFAULT '[]'::jsonb,
  telemetry JSONB NOT NULL DEFAULT '[]'::jsonb,
  risks JSONB NOT NULL DEFAULT '[]'::jsonb,
  sections JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS workflow_runs (
  id BIGSERIAL PRIMARY KEY,
  decision_id TEXT NOT NULL REFERENCES decisions(id) ON DELETE CASCADE,
  dqs NUMERIC NOT NULL,
  gate_decision TEXT NOT NULL,
  workflow_status TEXT NOT NULL,
  state_json JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS decision_ancestry_embeddings (
  decision_id TEXT PRIMARY KEY REFERENCES decisions(id) ON DELETE CASCADE,
  source_hash TEXT NOT NULL,
  source_text TEXT NOT NULL DEFAULT '',
  embedding_provider TEXT NOT NULL,
  embedding_model TEXT NOT NULL,
  embedding_dimensions INTEGER NOT NULL CHECK (embedding_dimensions >= 1),
  embedding_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS rate_limits (
  bucket_key TEXT PRIMARY KEY,
  count INTEGER NOT NULL,
  reset_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS agent_configs (
  agent_id TEXT PRIMARY KEY,
  role TEXT NOT NULL,
  name TEXT NOT NULL,
  system_message TEXT NOT NULL,
  user_message TEXT NOT NULL,
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  temperature NUMERIC NOT NULL,
  max_tokens INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE decision_reviews
  ADD COLUMN IF NOT EXISTS citations JSONB NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE decisions
  ADD COLUMN IF NOT EXISTS mitigations JSONB NOT NULL DEFAULT '[]'::jsonb;

CREATE INDEX IF NOT EXISTS decisions_status_idx ON decisions(status);
CREATE INDEX IF NOT EXISTS decisions_review_date_idx ON decisions(review_date DESC);
CREATE INDEX IF NOT EXISTS decision_reviews_decision_idx ON decision_reviews(decision_id);
CREATE INDEX IF NOT EXISTS workflow_runs_decision_idx ON workflow_runs(decision_id, created_at DESC);
CREATE INDEX IF NOT EXISTS rate_limits_reset_idx ON rate_limits(reset_at);
CREATE INDEX IF NOT EXISTS agent_configs_updated_idx ON agent_configs(updated_at DESC);
CREATE INDEX IF NOT EXISTS decision_ancestry_embeddings_updated_idx ON decision_ancestry_embeddings(updated_at DESC);
`;
