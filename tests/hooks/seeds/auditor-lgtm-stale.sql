-- Stale (outside window, > 1h) Pre-impl gate LGTM. Should be excluded by
-- the gate's window filter and behave as "no LGTM found".
INSERT INTO agent_messages (id, author_id, channel_id, input_mentions, content, created_at)
VALUES (
  gen_random_uuid(),
  'arc',
  '1486161309941764317',
  ARRAY['auditor']::text[],
  'Pre-impl gate dispatch — Sub-PR Y 5-section、6 項目 LGTM ✅ 取得済',
  NOW() - INTERVAL '2 hours'
);
