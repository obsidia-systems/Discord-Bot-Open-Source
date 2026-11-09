ALTER TABLE identity.external_identity
  ADD COLUMN avatar_hash TEXT;

ALTER TABLE identity.external_identity
  ADD CONSTRAINT external_identity_avatar_hash_check
  CHECK (
    avatar_hash IS NULL
    OR avatar_hash = ''
    OR avatar_hash ~ '^(a_)?[0-9a-fA-F]{32}$'
  );
