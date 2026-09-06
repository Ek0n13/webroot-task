ALTER TABLE analyses DROP COLUMN IF EXISTS owner_hash;

CREATE UNIQUE INDEX IF NOT EXISTS analyses_request_id_idx
  ON analyses (request_id);
