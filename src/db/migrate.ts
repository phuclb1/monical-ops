export const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS departments (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  full_name TEXT NOT NULL,
  role TEXT NOT NULL,
  department_id TEXT NOT NULL,
  phone TEXT,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
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
CREATE TABLE IF NOT EXISTS stays (
  id TEXT PRIMARY KEY,
  pms_code TEXT NOT NULL,
  origin TEXT NOT NULL DEFAULT 'ops',
  source TEXT NOT NULL DEFAULT 'walk_in',
  room_id TEXT,
  guest_name TEXT NOT NULL,
  guest_phone TEXT,
  status TEXT NOT NULL,
  arrival_date TEXT NOT NULL,
  departure_date TEXT NOT NULL,
  adults INTEGER NOT NULL DEFAULT 1,
  children INTEGER NOT NULL DEFAULT 0,
  breakfast INTEGER NOT NULL DEFAULT 1,
  pms_booking_ok INTEGER NOT NULL DEFAULT 0,
  pms_checkin_ok INTEGER NOT NULL DEFAULT 0,
  pms_checkout_ok INTEGER NOT NULL DEFAULT 0,
  invoice_ok INTEGER NOT NULL DEFAULT 0,
  payment_note TEXT,
  checkin_at TEXT,
  registration_due_at TEXT,
  registration_done_at TEXT,
  registration_reason TEXT,
  notes TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  created_by TEXT,
  updated_by TEXT
);
CREATE TABLE IF NOT EXISTS vehicles (
  id TEXT PRIMARY KEY,
  stay_id TEXT NOT NULL,
  vehicle_type TEXT NOT NULL,
  plate TEXT NOT NULL,
  location TEXT,
  key_location TEXT,
  notes TEXT,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS reception_week_slots (
  id TEXT PRIMARY KEY,
  weekday INTEGER NOT NULL,
  shift_type TEXT NOT NULL,
  user_id TEXT NOT NULL,
  effective_from TEXT NOT NULL DEFAULT '1970-01-01'
);
CREATE UNIQUE INDEX IF NOT EXISTS reception_week_slots_day_shift_from ON reception_week_slots (weekday, shift_type, effective_from);
CREATE TABLE IF NOT EXISTS reception_day_overrides (
  id TEXT PRIMARY KEY,
  date TEXT NOT NULL,
  shift_type TEXT NOT NULL,
  user_id TEXT NOT NULL,
  note TEXT,
  created_by TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS reception_day_overrides_date_shift ON reception_day_overrides (date, shift_type);
CREATE TABLE IF NOT EXISTS shifts (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  date TEXT NOT NULL,
  status TEXT NOT NULL,
  opened_at TEXT NOT NULL,
  opened_by TEXT NOT NULL,
  closed_at TEXT,
  closed_by TEXT,
  close_reason TEXT
);
CREATE TABLE IF NOT EXISTS checklists (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL DEFAULT 'shift_open',
  shift_id TEXT,
  stay_id TEXT,
  room_id TEXT,
  task_id TEXT,
  date TEXT,
  department_code TEXT NOT NULL DEFAULT 'reception',
  title TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS checklist_items (
  id TEXT PRIMARY KEY,
  checklist_id TEXT NOT NULL,
  item_key TEXT,
  label TEXT NOT NULL,
  required INTEGER NOT NULL DEFAULT 1,
  done INTEGER NOT NULL DEFAULT 0,
  done_by TEXT,
  done_at TEXT,
  skip_reason TEXT,
  note TEXT,
  photo TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL DEFAULT 'general',
  stay_id TEXT,
  from_dept TEXT NOT NULL,
  to_dept TEXT NOT NULL,
  room_id TEXT,
  area TEXT,
  content TEXT NOT NULL,
  priority TEXT NOT NULL,
  assignee_id TEXT,
  due_at TEXT,
  form_code TEXT,
  status TEXT NOT NULL,
  blocked_reason TEXT,
  blocked_action TEXT,
  zalo_message TEXT,
  zalo_sent INTEGER NOT NULL DEFAULT 0,
  zalo_sent_at TEXT,
  photo TEXT,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_by TEXT,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS task_history (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL,
  from_status TEXT,
  to_status TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  note TEXT,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS guest_requests (
  id TEXT PRIMARY KEY,
  stay_id TEXT,
  room_id TEXT,
  kind TEXT NOT NULL,
  content TEXT NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 1,
  due_at TEXT,
  assignee_id TEXT,
  status TEXT NOT NULL,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS handovers (
  id TEXT PRIMARY KEY,
  from_shift_id TEXT NOT NULL,
  to_shift_type TEXT,
  status TEXT NOT NULL,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  accepted_by TEXT,
  accepted_at TEXT,
  notes TEXT
);
CREATE TABLE IF NOT EXISTS handover_items (
  id TEXT PRIMARY KEY,
  handover_id TEXT NOT NULL,
  category TEXT NOT NULL,
  ref_type TEXT,
  ref_id TEXT,
  summary TEXT NOT NULL,
  note TEXT
);
CREATE TABLE IF NOT EXISTS form_submissions (
  id TEXT PRIMARY KEY,
  form_code TEXT NOT NULL,
  shift_id TEXT,
  room_id TEXT,
  stay_id TEXT,
  date TEXT NOT NULL,
  payload TEXT NOT NULL,
  signature TEXT,
  submitted_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);
CREATE TABLE IF NOT EXISTS incidents (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  location TEXT,
  room_id TEXT,
  description TEXT NOT NULL,
  severity TEXT NOT NULL,
  status TEXT NOT NULL,
  photo TEXT,
  reported_by TEXT NOT NULL,
  approved_by TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS breakfasts (
  id TEXT PRIMARY KEY,
  date TEXT NOT NULL UNIQUE,
  adults INTEGER NOT NULL DEFAULT 0,
  children INTEGER NOT NULL DEFAULT 0,
  vegetarian INTEGER NOT NULL DEFAULT 0,
  allergy INTEGER NOT NULL DEFAULT 0,
  early INTEGER NOT NULL DEFAULT 0,
  takeaway INTEGER NOT NULL DEFAULT 0,
  notes TEXT,
  sent_by TEXT,
  confirmed_by TEXT,
  confirmed_at TEXT,
  actual_adults INTEGER,
  actual_children INTEGER,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  role TEXT,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  link TEXT,
  read INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS audit_logs (
  id TEXT PRIMARY KEY,
  entity TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  action TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  before_json TEXT,
  after_json TEXT,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  endpoint TEXT NOT NULL UNIQUE,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  user_agent TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS sale_extra_types (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  unit_price INTEGER NOT NULL DEFAULT 0,
  unit TEXT NOT NULL DEFAULT 'once',
  unit_label TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE IF NOT EXISTS sale_extras (
  id TEXT PRIMARY KEY,
  booking_id TEXT NOT NULL,
  type_id TEXT,
  kind TEXT NOT NULL,
  name TEXT NOT NULL,
  qty INTEGER NOT NULL DEFAULT 1,
  unit_price INTEGER NOT NULL DEFAULT 0,
  unit TEXT NOT NULL DEFAULT 'once',
  created_at TEXT NOT NULL,
  created_by TEXT
);
CREATE INDEX IF NOT EXISTS sale_extras_booking ON sale_extras (booking_id);
`;

export const SCHEMA_PATCHES = [
  "ALTER TABLE tasks ADD COLUMN kind TEXT NOT NULL DEFAULT 'general'",
  "ALTER TABLE tasks ADD COLUMN stay_id TEXT",
  "CREATE INDEX IF NOT EXISTS tasks_kind ON tasks (kind)",
  "CREATE INDEX IF NOT EXISTS tasks_stay ON tasks (stay_id)",
  `CREATE TABLE IF NOT EXISTS push_subscriptions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  endpoint TEXT NOT NULL UNIQUE,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  user_agent TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
)`,
  "CREATE INDEX IF NOT EXISTS push_subscriptions_user ON push_subscriptions (user_id)",
  "ALTER TABLE reception_week_slots ADD COLUMN effective_from TEXT NOT NULL DEFAULT '1970-01-01'",
  "DROP INDEX IF EXISTS reception_week_slots_day_shift",
  "CREATE UNIQUE INDEX IF NOT EXISTS reception_week_slots_day_shift_from ON reception_week_slots (weekday, shift_type, effective_from)",
  "ALTER TABLE room_types ADD COLUMN base_rate INTEGER NOT NULL DEFAULT 0",
  `CREATE TABLE IF NOT EXISTS room_sales (
  id TEXT PRIMARY KEY,
  room_id TEXT NOT NULL,
  guest_name TEXT NOT NULL,
  guest_phone TEXT,
  source TEXT NOT NULL,
  status TEXT NOT NULL,
  check_in TEXT NOT NULL,
  check_out TEXT NOT NULL,
  adults INTEGER NOT NULL DEFAULT 1,
  children INTEGER NOT NULL DEFAULT 0,
  rate INTEGER NOT NULL DEFAULT 0,
  discount_kind TEXT NOT NULL DEFAULT 'none',
  discount_value INTEGER NOT NULL DEFAULT 0,
  deposit INTEGER NOT NULL DEFAULT 0,
  pms_code TEXT,
  notes TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  created_by TEXT,
  updated_by TEXT
)`,
  "CREATE INDEX IF NOT EXISTS room_sales_room ON room_sales (room_id)",
  "CREATE INDEX IF NOT EXISTS room_sales_dates ON room_sales (check_in, check_out)",
  "CREATE INDEX IF NOT EXISTS room_sales_status ON room_sales (status)",
  "ALTER TABLE room_types ADD COLUMN weekend_rate INTEGER NOT NULL DEFAULT 0",
  "ALTER TABLE room_sales ADD COLUMN discount_kind TEXT NOT NULL DEFAULT 'none'",
  "ALTER TABLE room_sales ADD COLUMN discount_value INTEGER NOT NULL DEFAULT 0",
  "ALTER TABLE room_sales ADD COLUMN origin TEXT NOT NULL DEFAULT 'ops'",
  "ALTER TABLE stays ADD COLUMN origin TEXT NOT NULL DEFAULT 'ops'",
  "ALTER TABLE stays ADD COLUMN source TEXT NOT NULL DEFAULT 'walk_in'",
  "CREATE INDEX IF NOT EXISTS room_sales_origin ON room_sales (origin)",
  "CREATE INDEX IF NOT EXISTS room_sales_source ON room_sales (source)",
  "CREATE INDEX IF NOT EXISTS stays_origin ON stays (origin)",
  "ALTER TABLE checklists ADD COLUMN kind TEXT NOT NULL DEFAULT 'shift_open'",
  "ALTER TABLE checklists ADD COLUMN stay_id TEXT",
  "ALTER TABLE checklists ADD COLUMN room_id TEXT",
  "ALTER TABLE checklists ADD COLUMN task_id TEXT",
  "ALTER TABLE checklists ADD COLUMN date TEXT",
  "ALTER TABLE checklist_items ADD COLUMN item_key TEXT",
  "ALTER TABLE checklist_items ADD COLUMN note TEXT",
  "ALTER TABLE checklist_items ADD COLUMN photo TEXT",
  "CREATE INDEX IF NOT EXISTS checklists_kind_date ON checklists (kind, date)",
  "CREATE INDEX IF NOT EXISTS checklists_task ON checklists (task_id)",
  "CREATE INDEX IF NOT EXISTS checklists_room ON checklists (room_id)",
  "CREATE INDEX IF NOT EXISTS audit_logs_created ON audit_logs (created_at)",
  "CREATE INDEX IF NOT EXISTS audit_logs_entity ON audit_logs (entity, created_at)",
  "ALTER TABLE room_sales ADD COLUMN booking_id TEXT",
  "CREATE INDEX IF NOT EXISTS room_sales_booking ON room_sales (booking_id)",
  `CREATE TABLE IF NOT EXISTS sale_extra_types (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  unit_price INTEGER NOT NULL DEFAULT 0,
  unit TEXT NOT NULL DEFAULT 'once',
  unit_label TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1
)`,
  `CREATE TABLE IF NOT EXISTS sale_extras (
  id TEXT PRIMARY KEY,
  booking_id TEXT NOT NULL,
  type_id TEXT,
  kind TEXT NOT NULL,
  name TEXT NOT NULL,
  qty INTEGER NOT NULL DEFAULT 1,
  unit_price INTEGER NOT NULL DEFAULT 0,
  unit TEXT NOT NULL DEFAULT 'once',
  created_at TEXT NOT NULL,
  created_by TEXT
)`,
  "CREATE INDEX IF NOT EXISTS sale_extras_booking ON sale_extras (booking_id)",
  "ALTER TABLE room_sales ADD COLUMN breakfast INTEGER NOT NULL DEFAULT 1",
  "ALTER TABLE room_sales ADD COLUMN discount_kind TEXT DEFAULT 'none'",
  "ALTER TABLE room_sales ADD COLUMN discount_value INTEGER DEFAULT 0",
  "ALTER TABLE room_sales ADD COLUMN cash_paid INTEGER NOT NULL DEFAULT 0",
  "ALTER TABLE room_sales ADD COLUMN transfer_paid INTEGER NOT NULL DEFAULT 0",
  "UPDATE room_sales SET transfer_paid = deposit WHERE deposit > 0 AND cash_paid = 0 AND transfer_paid = 0",
  "ALTER TABLE room_types ADD COLUMN adults INTEGER DEFAULT 0",
  "ALTER TABLE room_sales ADD COLUMN cars INTEGER DEFAULT 0",
  "ALTER TABLE room_sales ADD COLUMN bikes INTEGER DEFAULT 0",
  "ALTER TABLE room_sales ADD COLUMN breakfast_adults INTEGER",
  "ALTER TABLE room_sales ADD COLUMN breakfast_children INTEGER",
  "UPDATE room_sales SET breakfast_adults = CASE WHEN breakfast = 0 THEN 0 ELSE adults END WHERE breakfast_adults IS NULL",
  "UPDATE room_sales SET breakfast_children = CASE WHEN breakfast = 0 THEN 0 ELSE children END WHERE breakfast_children IS NULL",
  "ALTER TABLE room_sales ADD COLUMN company_paid INTEGER NOT NULL DEFAULT 0",
];
