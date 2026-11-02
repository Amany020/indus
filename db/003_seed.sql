-- IndustryMind — Seed Data (003)
-- Run AFTER 001 + 002
-- Seeds: one factory, one branch, one demo machine

-- Factory
INSERT INTO factories (id, name) VALUES
    ('a0000000-0000-0000-0000-000000000001', 'IndusWorks Manufacturing')
ON CONFLICT (id) DO NOTHING;

-- Branch
INSERT INTO branches (id, factory_id, name) VALUES
    ('b0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'Main Plant')
ON CONFLICT (id) DO NOTHING;

-- Demo Machine: Conveyor Drive Unit
INSERT INTO machines (id, factory_id, branch_id, name, workcell, model_number) VALUES
    ('c0000000-0000-0000-0000-000000000001',
     'a0000000-0000-0000-0000-000000000001',
     'b0000000-0000-0000-0000-000000000001',
     'Conveyor Drive Unit',
     'Assembly Line D',
     'CDU-7500X')
ON CONFLICT (id) DO NOTHING;
