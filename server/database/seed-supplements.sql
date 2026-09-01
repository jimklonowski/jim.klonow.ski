-- One-time seed for the supplements table — the stack as of 2026-08-24. Do NOT re-run after it
-- lands on an environment: rows are plain INSERTs and would duplicate.
--
--   npx wrangler d1 execute jim-klonow-ski-db --local  --file server/database/seed-supplements.sql
--   npx wrangler d1 execute jim-klonow-ski-db --remote --file server/database/seed-supplements.sql
INSERT INTO supplements (name, dose, category, status, schedule, started, stopped, notes, sort, created_at) VALUES
  -- Daily oral stack
  ('Vitamin D3 + K2',             NULL,                 'supplement', 'active', 'daily',    NULL, NULL, NULL, 10, '2026-08-24T00:00:00.000Z'),
  ('Thorne 2-A-Day multivitamin', '2 capsules',         'supplement', 'active', 'daily',    NULL, NULL, NULL, 20, '2026-08-24T00:00:00.000Z'),
  ('Magnesium glycinate',         '160 mg',             'supplement', 'active', 'daily',    NULL, NULL, NULL, 30, '2026-08-24T00:00:00.000Z'),
  ('Boron',                       '8 mg',               'supplement', 'active', 'daily',    NULL, NULL, NULL, 40, '2026-08-24T00:00:00.000Z'),
  ('Krill oil',                   NULL,                 'supplement', 'active', 'daily',    NULL, NULL, NULL, 50, '2026-08-24T00:00:00.000Z'),
  ('CoQ10',                       NULL,                 'supplement', 'active', 'daily',    NULL, NULL, NULL, 60, '2026-08-24T00:00:00.000Z'),
  ('L-Theanine',                  '200 mg',             'supplement', 'active', 'daily',    NULL, NULL, NULL, 70, '2026-08-24T00:00:00.000Z'),
  ('Iron bisglycinate',           '50 mg',              'supplement', 'active', 'daily',    NULL, NULL, 'Raised from 25 mg on 2026-08-22', 80, '2026-08-24T00:00:00.000Z'),
  ('Psyllium husk',               '1.5 g (3 capsules)', 'supplement', 'active', 'mornings', NULL, NULL, NULL, 90, '2026-08-24T00:00:00.000Z'),
  ('Tadalafil (Cialis)',          '5 mg',               'supplement', 'active', 'daily',    NULL, NULL, NULL, 100, '2026-08-24T00:00:00.000Z'),
  ('Finasteride',                 '1 mg',               'supplement', 'active', 'daily',    NULL, NULL, 'Also logged in the journal dose log', 110, '2026-08-24T00:00:00.000Z'),
  ('Xyzal (levocetirizine)',      '5 mg',               'supplement', 'active', 'daily',    '2026-09-01', NULL, 'Replaced the prior OTC allergy pill when that bottle ran out. Levocetirizine can be mildly sedating — worth weighing when sleep or HRV shifts', 120, '2026-08-24T00:00:00.000Z'),

  -- Recently discontinued (kept for lab-trend context)
  ('Turmeric',    NULL, 'supplement', 'stopped', 'daily', NULL, '2026-08-22', 'Taken for many months before stopping', 130, '2026-08-24T00:00:00.000Z'),
  ('Ashwagandha', NULL, 'supplement', 'stopped', 'daily', NULL, '2026-08-22', 'Taken for many months before stopping', 140, '2026-08-24T00:00:00.000Z'),
  ('Allergy pill (OTC antihistamine)', NULL, 'supplement', 'stopped', 'daily', NULL, '2026-09-01', 'Daily for a long stretch; the 300-count bottle ran out and was replaced by Xyzal', 150, '2026-08-24T00:00:00.000Z'),

  -- On hand, not currently taking
  ('Anavar (oxandrolone)',                       '10 mg + 25 mg tablets', 'supplement', 'on_hand', 'daily', NULL, NULL, 'Weighing a lean-mass cycle (vs Primobolan)', 200, '2026-08-24T00:00:00.000Z'),
  ('Primobolan enanthate',                       '200 mg/mL',             'supplement', 'on_hand', 'daily', NULL, NULL, 'Weighing a lean-mass cycle (vs Anavar)', 210, '2026-08-24T00:00:00.000Z'),
  ('Dutasteride',                                '0.5 mg oral',           'supplement', 'on_hand', 'daily', NULL, NULL, 'Possible switch from finasteride for hairline', 220, '2026-08-24T00:00:00.000Z'),
  ('Thorne Liver Cleanse (berberine HCl + milk thistle)', NULL,           'supplement', 'on_hand', 'daily', NULL, NULL, 'Support staged for a possible oral-anabolic run', 230, '2026-08-24T00:00:00.000Z'),
  ('Citrus bergamot',                            '1,200 mg',              'supplement', 'on_hand', 'daily', NULL, NULL, 'Lipid support on hand', 240, '2026-08-24T00:00:00.000Z'),
  ('TUDCA',                                      '250 mg',                'supplement', 'on_hand', 'daily', NULL, NULL, 'Liver support on hand', 250, '2026-08-24T00:00:00.000Z'),
  ('Lipid Support Complex (Pure Encapsulations)', NULL,                   'supplement', 'on_hand', 'daily', NULL, NULL, 'Lipid support on hand', 260, '2026-08-24T00:00:00.000Z'),
  ('DHEA',                                       NULL,                    'supplement', 'on_hand', 'daily', NULL, NULL, NULL, 270, '2026-08-24T00:00:00.000Z'),
  ('Milk thistle',                               NULL,                    'supplement', 'on_hand', 'daily', NULL, NULL, NULL, 280, '2026-08-24T00:00:00.000Z'),
  ('NAC',                                        NULL,                    'supplement', 'on_hand', 'daily', NULL, NULL, NULL, 290, '2026-08-24T00:00:00.000Z'),
  ('Alpha lipoic acid',                          NULL,                    'supplement', 'on_hand', 'daily', NULL, NULL, NULL, 300, '2026-08-24T00:00:00.000Z'),

  -- Skin & hair
  ('Red light therapy',   '~10 min', 'skin', 'active', 'each morning after shower', NULL, NULL, NULL, 400, '2026-08-24T00:00:00.000Z'),
  ('Tretinoin',           NULL,      'skin', 'active', 'daily',                     NULL, NULL, NULL, 410, '2026-08-24T00:00:00.000Z'),
  ('Azelaic acid',        NULL,      'skin', 'active', 'daily',                     NULL, NULL, NULL, 420, '2026-08-24T00:00:00.000Z'),
  ('SPF 50+ sunscreen',   NULL,      'skin', 'active', 'daily',                     NULL, NULL, NULL, 430, '2026-08-24T00:00:00.000Z'),
  ('Nizoral 1% (ketoconazole) shampoo',            NULL, 'skin', 'active', 'Mondays + Thursdays', NULL, NULL, 'Hairline protection', 440, '2026-08-24T00:00:00.000Z'),
  ('Paul Mitchell Shampoo Two (clarifying)',       NULL, 'skin', 'active', 'Sundays',             NULL, NULL, NULL, 450, '2026-08-24T00:00:00.000Z');
