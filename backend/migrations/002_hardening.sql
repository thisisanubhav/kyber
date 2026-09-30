CREATE TABLE IF NOT EXISTS outbox_events (
  id bigserial PRIMARY KEY,
  topic text NOT NULL CHECK (topic IN ('email', 'scan')),
  event_name text NOT NULL,
  dedupe_key text NOT NULL UNIQUE,
  payload jsonb NOT NULL,
  available_at timestamptz NOT NULL DEFAULT now(),
  claimed_at timestamptz,
  published_at timestamptz,
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS outbox_events_pending_idx
  ON outbox_events (available_at, id)
  WHERE published_at IS NULL;

CREATE INDEX IF NOT EXISTS sessions_expires_at_idx ON sessions(expires_at);
CREATE INDEX IF NOT EXISTS password_reset_expires_at_idx ON password_reset_tokens(expires_at);
CREATE INDEX IF NOT EXISTS enrollment_tickets_expires_at_idx ON enrollment_tickets(expires_at);
CREATE INDEX IF NOT EXISTS application_drafts_expires_at_idx ON application_drafts(expires_at);

CREATE TABLE IF NOT EXISTS email_verification_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS email_verification_user_idx ON email_verification_tokens(user_id);
CREATE INDEX IF NOT EXISTS email_verification_expires_at_idx ON email_verification_tokens(expires_at);

INSERT INTO jobs (id, title, active) VALUES
  ('founding-engineer', 'Founding Engineer — Full Stack', true),
  ('optimization-engineer', 'Optimization Engineer', true),
  ('operations-research-scientist', 'Operations Research Scientist', true),
  ('founding-commercial-lead', 'Founding Commercial Lead', true)
ON CONFLICT (id) DO UPDATE SET title = EXCLUDED.title;
