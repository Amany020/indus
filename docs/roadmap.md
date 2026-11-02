# IndustryMind — Feature Roadmap

> All features are behind feature flags (DEFAULT OFF).  
> Existing hackathon behaviour is preserved with all flags off.

## Completed

| Phase | Name | Status |
|-------|------|--------|
| P1-P8 | Hackathon Slice | ✅ Done, demo-ready |
| R0 | Baseline Freeze | ✅ Done |
| R1 | CI/CD Hardening | ✅ Done |
| R2 | Supabase Auth | ✅ Done (`AUTH_MODE`) |
| R3 | Multi-Factory Tenancy + RLS | ✅ Done (`TENANCY_ENFORCED`, `RLS_ENABLED`) |
| R4 | Retention Jobs | ✅ Done (`RETENTION_JOBS_ENABLED`) |
| R5 | QR Scanning | ✅ Done (`QR_SCAN_ENABLED`) |
| R6 | Bhashini TTS | ✅ Done (`TTS_PROVIDER`) |
| R7 | SOP Change Proposals | ✅ Done (`SOP_PROPOSALS_ENABLED`) |
| R8 | Knowledge Graph | ✅ Done (`KNOWLEDGE_GRAPH_ENABLED`) |
| R9 | Change-Impact Engine | ✅ Done (`CHANGE_IMPACT_ENABLED`) |
| R10 | Multi-Agent Review | ✅ Done (`MULTI_AGENT_REVIEW`) |

## Planned

All initial roadmap phases implemented behind DEFAULT OFF flags.

## Dependency Order

```
R0 → R1 → R2 → R3 (auth before tenancy)
R0 → R4 (independent of auth)
R0 → R5 (independent)
R0 → R6 (independent)
R3 → R7 → R8 → R9 (knowledge chain)
R8 → R10 (graph before multi-agent)
```

## Migration Numbering

| File | Phase |
|------|-------|
| `db/001_schema.sql` | P1 (existing) |
| `db/002_hackathon_slice.sql` | P2-P8 (existing) |
| `db/003_seed.sql` | P3 (existing) |
| `db/004_auth.sql` | R2 |
| `db/005_tenancy.sql` | R3 |
| `db/006_rls.sql` | R3 |
| `db/007_factory_b_seed.sql` | R3 |
| `db/008_retention.sql` | R4 |
| `db/009_sop_proposals.sql` | R7 |
| `db/010_knowledge_graph.sql` | R8 |
| `db/011_change_impact.sql` | R9 |
