-- Minimal subset of agent-comms-mcp `agent_messages` schema for Pre-impl gate
-- hook tests (Sub-PR 2.7). Mirrors the columns the hook queries:
--   - author_id, input_mentions, content, created_at
-- and the PK so the seeds insert without conflict.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS agent_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id TEXT NOT NULL,
  author_id TEXT NOT NULL,
  content TEXT NOT NULL,
  message_type TEXT,
  metadata JSONB,
  input_mentions TEXT[],
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_agent_messages_author ON agent_messages(author_id, created_at);
