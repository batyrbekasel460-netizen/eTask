ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'admin' BEFORE 'director';
UPDATE users SET role='admin',position='Системный администратор',department_id=NULL,updated_at=now()
WHERE username='admin' AND full_name='Администратор eTask';
CREATE TABLE IF NOT EXISTS audit_logs(
  id bigserial PRIMARY KEY,
  actor_id uuid REFERENCES users(id) ON DELETE SET NULL,
  action text NOT NULL,
  target_type text NOT NULL,
  target_id text,
  details jsonb NOT NULL DEFAULT '{}',
  ip inet,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS audit_logs_created_idx ON audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS audit_logs_actor_idx ON audit_logs(actor_id,created_at DESC);
