# Vertical Slice Acceptance

Status: **passing locally on Windows** (2026-10-25).

Run:

```powershell
pnpm test:acceptance
```

This runs lint, type checks, Vitest, the Electron E2E flow, and leaves the developer API key intact.

| Criterion | Evidence |
|---|---|
| Packaged Electron app launches | `run.bat` and `pnpm package`; packaged executable smoke-tested |
| Character with point buy and derived stats | Character creation E2E + character rule tests |
| Handcrafted and procedural campaigns | Handcrafted E2E; procedural generation and generic-settlement tests |
| Procedural report has zero hard errors | Worldgen tests and generation report UI |
| Explore world, enter town, talk to NPCs | E2E: Redford, Hessa dialogue, journal, shop, crypt |
| Insult/disposition change | NPC intent tests + live Hessa AI turn changed trust/memory |
| Trade respects engine bounds | Merchant buy/sell tests + E2E torch buy/sell |
| Recruit companion, fight, camp comment | Companion recruit/dismiss, battle turn, banter tests |
| Complete first quest stages | E2E: accept, travel, recover ledger, turn in |
| Win a battle, retreat from another | Victory/retreat/reward engine tests; E2E dungeon retreat |
| Save, quit, load identical state | Local save/continue E2E + save-slot API tests |
| AI outage fallback | Missing-key E2E path; authored dialogue remains usable |
| AI panel prompt/response/latency/cost | AI Lab, raw event stream, telemetry, recent calls |
| Battle commands under 50 ms | Deterministic in-process engine commands; measured by tests |
| No secrets in renderer/logs | Keystore server-only; CSP and bearer token; key never sent to renderer |
| Installer and icon | `pnpm package:installer`; `apps/desktop/build/icon.ico` |
| Travel Map | Each world hex generates a deterministic 40×28 field with reachable edge gates, settlement gates, and visible threats |
| WASD and crossings | Smooth screen-relative movement in Electron; walking through a road edge changes world hex; gates auto-load towns |
| Seamless travel combat | Visible groups auto-aggro and use the current isometric field map for initiative/cover/companion turns |
| Weather and graphics | Quality and weather settings persist; rain, snow, fog, water, and dungeon dust render without page errors; reduced motion and low quality remain usable |
| Actor rigs | Player, NPC, companion, bandit, wolf, and crypt shade visuals resolve from content; eight screen facings, walk/run, combat cues, conditions, and defeat poses render without changing engine timing or saves |
| Atlas fast travel | Fast travel loads the destination field outside its gate and preserves time/fog/quest progress |
| Travel save/load | Current field map, enemies, cleared groups, and anchor position persist in the campaign save |

Notes:

- FPS is bounded by batched textured hex meshes, one camera filter pass on non-low quality, quality-scaled weather layers, and procedural actor rigs for the handful of visible units; no continuous simulation runs in the renderer.
- The AI E2E success path requires a live key and is therefore not part of the default CI run. The live path was verified manually.
- Save slots are manual snapshots; the active chronicle autosaves.
