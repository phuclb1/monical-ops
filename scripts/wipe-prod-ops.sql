-- Wipe operational rows on prod D1. Keep users, departments, room catalog, standing roster.
DELETE FROM checklist_items;
DELETE FROM checklists;
DELETE FROM handover_items;
DELETE FROM handovers;
DELETE FROM task_history;
DELETE FROM tasks;
DELETE FROM guest_requests;
DELETE FROM vehicles;
DELETE FROM stays;
DELETE FROM shifts;
DELETE FROM breakfasts;
DELETE FROM incidents;
DELETE FROM notifications;
DELETE FROM form_submissions;
DELETE FROM audit_logs;
DELETE FROM push_subscriptions;
DELETE FROM reception_day_overrides;

UPDATE rooms SET
  ops_status = 'vacant_clean',
  hk_status = 'ins',
  assigned_to = NULL,
  ooo_reason = NULL,
  ooo_approved = 0,
  notes = NULL,
  updated_by = NULL;
