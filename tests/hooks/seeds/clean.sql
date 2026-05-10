-- Wipe Pre-impl gate LGTM messages so a test starts from a known state.
DELETE FROM agent_messages
WHERE author_id = 'arc'
  AND 'auditor' = ANY(input_mentions)
  AND content ~ 'Pre-impl gate.*LGTM|Pre-impl gate.*PASS';
