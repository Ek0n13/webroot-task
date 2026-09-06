CREATE TABLE analyses (
  id uuid PRIMARY KEY,
  request_id uuid NOT NULL,
  article text NOT NULL CHECK (char_length(article) BETWEEN 100 AND 50000),
  state text NOT NULL DEFAULT 'queued'
    CHECK (state IN ('queued', 'processing', 'completed', 'failed')),
  result jsonb,
  lease_id uuid,
  attempt integer NOT NULL DEFAULT -1,
  lease_until timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT now() + interval '7 days',
  CHECK ((state IN ('completed', 'failed')) = (result IS NOT NULL))
);

CREATE INDEX analyses_expiry_idx ON analyses (expires_at);
CREATE UNIQUE INDEX analyses_request_id_idx ON analyses (request_id);
