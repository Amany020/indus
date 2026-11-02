-- IndustryMind — Demo Factory B Seed Data (007)
-- Phase: R3 Multi-Factory Tenancy
-- Depends on: 001_schema.sql, 005_tenancy.sql
-- Seeds: Factory B, branch, and demo machine to test cross-tenant isolation

INSERT INTO factories (id, name, display_name) VALUES
    ('a0000000-0000-0000-0000-000000000002', 'IndusWorks South Plant', 'IndusWorks Plant B (Chennai)')
ON CONFLICT (id) DO NOTHING;

INSERT INTO branches (id, factory_id, name) VALUES
    ('b0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000002', 'South Facility')
ON CONFLICT (id) DO NOTHING;

INSERT INTO machines (id, factory_id, branch_id, name, workcell, model_number) VALUES
    ('c0000000-0000-0000-0000-000000000002',
     'a0000000-0000-0000-0000-000000000002',
     'b0000000-0000-0000-0000-000000000002',
     'Hydraulic Stamping Press',
     'Press Shop 2',
     'HSP-3000')
ON CONFLICT (id) DO NOTHING;
