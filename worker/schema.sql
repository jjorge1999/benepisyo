-- Benepisyo D1 schema. Apply with: npx wrangler d1 execute benepisyo --file=schema.sql

CREATE TABLE IF NOT EXISTS benefits (
  id            TEXT PRIMARY KEY,
  draft         TEXT NOT NULL,          -- full benefit JSON being edited
  published     TEXT,                   -- last published benefit JSON (public)
  status        TEXT NOT NULL DEFAULT 'draft',  -- draft | in_review | published | archived
  updated_by    TEXT,
  updated_at    TEXT,
  submitted_by  TEXT,
  submitted_at  TEXT,
  published_by  TEXT,
  published_at  TEXT
);

CREATE TABLE IF NOT EXISTS history (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  benefit_id  TEXT NOT NULL,
  at          TEXT NOT NULL,
  editor      TEXT NOT NULL,
  action      TEXT NOT NULL,            -- create | save | submit | publish | verify | archive | import
  note        TEXT
);
CREATE INDEX IF NOT EXISTS history_benefit ON history (benefit_id, at);

CREATE TABLE IF NOT EXISTS reports (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  benefit_id  TEXT NOT NULL,
  message     TEXT NOT NULL,
  contact     TEXT,                     -- optional; erased after 90 days
  photo_key   TEXT,                     -- R2 object key, private
  page        TEXT,
  status      TEXT NOT NULL DEFAULT 'new',  -- new | checking | fixed | rejected
  reply       TEXT,
  handled_by  TEXT,
  created_at  TEXT NOT NULL,
  updated_at  TEXT
);
CREATE INDEX IF NOT EXISTS reports_status ON reports (status, created_at);

CREATE TABLE IF NOT EXISTS checkins (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  benefit_id  TEXT NOT NULL,
  answer      TEXT NOT NULL,            -- yes | no | different
  reason      TEXT,                     -- budget | ended | sched | other
  detail      TEXT,
  city        TEXT,
  month       TEXT NOT NULL,            -- YYYY-MM, for the public monthly count
  created_at  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS checkins_month ON checkins (benefit_id, month, answer);

CREATE TABLE IF NOT EXISTS city_requests (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  city        TEXT NOT NULL,
  created_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS rate (
  key           TEXT PRIMARY KEY,
  count         INTEGER NOT NULL,
  window_start  INTEGER NOT NULL
);
