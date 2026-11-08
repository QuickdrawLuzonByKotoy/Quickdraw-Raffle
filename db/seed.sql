-- Quickdraw Initial Seed Data
-- Safe to run multiple times using ON CONFLICT DO NOTHING

INSERT INTO users (id, username, password, role, display_name, bracket_name, manager_id, active)
VALUES
  ('usr_superadmin', 'kotoy', 'IamwhoIam1!', 'superadmin', 'Kotoy (Superadmin)', 'Global Command', NULL, TRUE),
  ('mgr_north', 'mgr_north', 'NorthPass1!', 'manager', 'Elena Reyes — North Bracket', 'North Luzon Community Bracket', NULL, TRUE),
  ('mgr_south', 'mgr_south', 'SouthPass1!', 'manager', 'Marco Dizon — South Bracket', 'South Metro Community Bracket', NULL, TRUE),
  ('agent_leo', 'agent_leo', 'LeoPass1!', 'agent', 'Agent Leo (North)', 'North Luzon Community Bracket', 'mgr_north', TRUE),
  ('agent_maya', 'agent_maya', 'MayaPass1!', 'agent', 'Agent Maya (North)', 'North Luzon Community Bracket', 'mgr_north', TRUE),
  ('agent_sam', 'agent_sam', 'SamPass1!', 'agent', 'Agent Sam (South)', 'South Metro Community Bracket', 'mgr_south', TRUE)
ON CONFLICT (id) DO NOTHING;

INSERT INTO events (id, name, manager_id, bracket_name, total_slots, price_per_slot, status, payment_verified, endorsed_at, drawn_at, archived_at)
VALUES
  ('evt_selling_01', 'Community Harvest Grocery & Cash Bonanza', 'mgr_north', 'North Luzon Community Bracket', 20, 150.00, 'selling', FALSE, NULL, NULL, NULL),
  ('evt_endorsed_02', 'Barangay Fiesta Mega Tech & Sari-Sari Draw', 'mgr_north', 'North Luzon Community Bracket', 25, 200.00, 'endorsed', TRUE, NOW() - INTERVAL '2 hours', NULL, NULL),
  ('evt_drawn_03', 'Sunday Market Livelihood Starter Bundle', 'mgr_north', 'North Luzon Community Bracket', 20, 100.00, 'drawn', TRUE, NOW() - INTERVAL '14 hours', NOW() - INTERVAL '10 hours', NULL),
  ('evt_archived_04', 'Back-to-School Community Study Desk Drive', 'mgr_south', 'South Metro Community Bracket', 15, 120.00, 'archived', TRUE, NOW() - INTERVAL '50 hours', NOW() - INTERVAL '48 hours', NOW() - INTERVAL '36 hours')
ON CONFLICT (id) DO NOTHING;

INSERT INTO prizes (prize_id, event_id, rank_label, description, preferred_slot, winning_slot, release_status, released_by_agent_id, released_at)
VALUES
  ('prz_101', 'evt_selling_01', '1st Prize — Grand Basket + ₱1,500 Cash', 'Full family grocery sack (25kg rice + pantry bundle) + ₱1,500 cash assistance', 7, NULL, 'pending_release', NULL, NULL),
  ('prz_102', 'evt_selling_01', '2nd Prize — Community Pantry Pack', '10kg premium rice + assorted canned goods pack', NULL, NULL, 'pending_release', NULL, NULL),
  ('prz_201', 'evt_endorsed_02', 'Grand Prize — Smart 5G Tablet + Load Wallet', 'Brand new 11-inch Wi-Fi/5G Tablet + ₱1,000 retailer e-load starter wallet', 14, NULL, 'pending_release', NULL, NULL),
  ('prz_202', 'evt_endorsed_02', 'Runner-Up Prize — Heavy Duty Blender + Rice Cooker', 'Commercial-grade countertop blender and 1.8L family rice cooker set', NULL, NULL, 'pending_release', NULL, NULL),
  ('prz_301', 'evt_drawn_03', '1st Prize — Street Food Cart Burner & Cookware Kit', 'Dual stainless burner, deep fryer vat, and ₱500 initial capital voucher', 5, 5, 'released', 'agent_leo', NOW() - INTERVAL '6 hours'),
  ('prz_302', 'evt_drawn_03', '2nd Prize — 25kg Premium Sinandomeng Sack', 'One full 25kg sack of newly harvested Sinandomeng rice', NULL, 12, 'pending_release', NULL, NULL),
  ('prz_401', 'evt_archived_04', '1st Prize — Study Table + Rechargeable LED Lamp + Backpack', 'Ergonomic folding study desk, rechargeable emergency lamp, and school supply set', NULL, 9, 'released', 'agent_sam', NOW() - INTERVAL '38 hours'),
  ('prz_402', 'evt_archived_04', '2nd Prize — Scientific Calculator & Art Kit', 'Casio-grade scientific calculator + complete drawing and geometry set', NULL, 3, 'released', 'agent_sam', NOW() - INTERVAL '36 hours')
ON CONFLICT (prize_id) DO NOTHING;

INSERT INTO proposals (id, manager_id, type, target_event_id, proposed_name, proposed_slots, proposed_price, proposed_prizes, notes, status)
VALUES
  ('prop_seed_01', 'mgr_south', 'create', NULL, 'Weekend Tricycle Drivers Fuel & Maintenance Raffle', 30, 100.00, '1st Prize: ₱1,500 Fuel Voucher + Change Oil Kit | 2nd Prize: Heavy Duty Tire Pump', 'All 30 slots pre-subscribed by South Metro TODA members; ready for draw.', 'pending')
ON CONFLICT (id) DO NOTHING;