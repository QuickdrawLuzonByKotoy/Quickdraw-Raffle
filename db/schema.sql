-- Quickdraw Platform Schema (PostgreSQL / Supabase)
-- Matches the v2.5 Engine data structures in public/index.html

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  password TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('superadmin', 'manager', 'agent')),
  display_name TEXT NOT NULL,
  bracket_name TEXT NOT NULL,
  manager_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS events (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  manager_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  bracket_name TEXT NOT NULL,
  total_slots INTEGER NOT NULL CHECK (total_slots >= 5 AND total_slots <= 500),
  price_per_slot NUMERIC(10, 2) NOT NULL CHECK (price_per_slot > 0),
  status TEXT NOT NULL CHECK (status IN ('selling', 'endorsed', 'drawn', 'archived')),
  payment_verified BOOLEAN NOT NULL DEFAULT FALSE,
  endorsed_at TIMESTAMPTZ,
  drawn_at TIMESTAMPTZ,
  archived_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS prizes (
  prize_id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  rank_label TEXT NOT NULL,
  description TEXT NOT NULL,
  preferred_slot INTEGER,
  winning_slot INTEGER,
  release_status TEXT NOT NULL DEFAULT 'pending_release' CHECK (release_status IN ('pending_release', 'released')),
  released_by_agent_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  released_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS slots (
  event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  slot_number INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'available' CHECK (status IN ('available', 'sold')),
  buyer_nickname TEXT,
  buyer_phone TEXT,
  agent_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  sold_at TIMESTAMPTZ,
  tx_id TEXT,
  PRIMARY KEY (event_id, slot_number)
);

CREATE TABLE IF NOT EXISTS proposals (
  id TEXT PRIMARY KEY,
  manager_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  type TEXT NOT NULL DEFAULT 'create',
  target_event_id TEXT,
  proposed_name TEXT NOT NULL,
  proposed_slots INTEGER NOT NULL,
  proposed_price NUMERIC(10, 2) NOT NULL,
  proposed_prizes TEXT NOT NULL,
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS transactions (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  event_name TEXT NOT NULL,
  agent_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  manager_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  buyer_nickname TEXT NOT NULL,
  buyer_phone TEXT NOT NULL,
  slots JSONB NOT NULL DEFAULT '[]'::jsonb,
  sale_mode TEXT NOT NULL CHECK (sale_mode IN ('individual', 'batch')),
  amount_total NUMERIC(12, 2) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- JSONB state snapshot table for syncing QUICKDRAW_DB_V3 state payloads
CREATE TABLE IF NOT EXISTS app_state (
  id TEXT PRIMARY KEY,
  payload JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);