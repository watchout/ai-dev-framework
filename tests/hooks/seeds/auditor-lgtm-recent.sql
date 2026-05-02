-- Recent (within window) Pre-impl gate LGTM message from arc → auditor.
INSERT INTO agent_messages (id, author_id, channel_id, input_mentions, content, created_at)
VALUES (
  gen_random_uuid(),
  'arc',
  '1486161309941764317',
  ARRAY['auditor']::text[],
  'Pre-impl gate dispatch — Sub-PR X 5-section、6 項目 LGTM ✅ 取得済',
  NOW() - INTERVAL '10 minutes'
);
