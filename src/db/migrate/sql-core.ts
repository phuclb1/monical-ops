export const SCHEMA_SQL_CORE = `CREATE TABLE IF NOT EXISTS departments (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  email TEXT UNIQUE,
  password_hash TEXT NOT NULL,
  session_version INTEGER NOT NULL DEFAULT 0,
  full_name TEXT NOT NULL,
  role TEXT NOT NULL,
  department_id TEXT NOT NULL,
  phone TEXT,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  used_at TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS password_reset_tokens_user ON password_reset_tokens (user_id);
CREATE INDEX IF NOT EXISTS password_reset_tokens_expires ON password_reset_tokens (expires_at);
CREATE TABLE IF NOT EXISTS room_types (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL UNIQUE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  base_rate INTEGER NOT NULL DEFAULT 0,
  weekend_rate INTEGER NOT NULL DEFAULT 0,
  adults INTEGER NOT NULL DEFAULT 2
);
CREATE TABLE IF NOT EXISTS rooms (
  id TEXT PRIMARY KEY,
  number TEXT NOT NULL UNIQUE,
  floor INTEGER NOT NULL,
  type TEXT NOT NULL,
  ops_status TEXT NOT NULL,
  hk_status TEXT NOT NULL,
  assigned_to TEXT,
  ooo_reason TEXT,
  ooo_approved INTEGER NOT NULL DEFAULT 0,
  notes TEXT,
  updated_at TEXT NOT NULL,
  updated_by TEXT
);
CREATE TABLE IF NOT EXISTS room_sales (
  id TEXT PRIMARY KEY,
  booking_id TEXT,
  room_id TEXT NOT NULL,
  guest_name TEXT NOT NULL,
  guest_phone TEXT,
  origin TEXT NOT NULL DEFAULT 'ops',
  source TEXT NOT NULL,
  ota_payment_mode TEXT NOT NULL DEFAULT 'debt',
  invoice_requested INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL,
  check_in TEXT NOT NULL,
  check_out TEXT NOT NULL,
  adults INTEGER NOT NULL DEFAULT 1,
  children INTEGER NOT NULL DEFAULT 0,
  rate INTEGER NOT NULL DEFAULT 0,
  discount_kind TEXT NOT NULL DEFAULT 'none',
  discount_value INTEGER NOT NULL DEFAULT 0,
  deposit INTEGER NOT NULL DEFAULT 0,
  cash_paid INTEGER NOT NULL DEFAULT 0,
  transfer_paid INTEGER NOT NULL DEFAULT 0,
  company_paid INTEGER NOT NULL DEFAULT 0,
  breakfast INTEGER NOT NULL DEFAULT 1,
  breakfast_adults INTEGER,
  breakfast_children INTEGER,
  cars INTEGER NOT NULL DEFAULT 0,
  bikes INTEGER NOT NULL DEFAULT 0,
  pms_code TEXT,
  notes TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  created_by TEXT,
  updated_by TEXT
);
CREATE INDEX IF NOT EXISTS room_sales_room ON room_sales (room_id);
CREATE INDEX IF NOT EXISTS room_sales_dates ON room_sales (check_in, check_out);
CREATE INDEX IF NOT EXISTS room_sales_status ON room_sales (status);
CREATE INDEX IF NOT EXISTS room_sales_booking ON room_sales (booking_id);
`;
