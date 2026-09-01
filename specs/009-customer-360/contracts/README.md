# Contracts — Customer 360 (009)

**Status**: V1 stub — OpenAPI placeholders intentionally minimal.

The 7 YAML files (`api-client-me.yaml`, `api-client-preferences.yaml`, etc.) currently contain a generic `paths: /test` 11-line placeholder. Implementation is contract-accurate via Zod schemas in `app/api/client/*` (e.g., `app/api/client/me/route.ts` `Client360` response, `app/api/reviews/route.ts` `rating 1-5`, `app/api/client/check-in/route.ts` `checkin_code`).

**Why not full OpenAPI yet**: Spec-kit `spec-driven` expects real OpenAPI, but the live Zod + `lib/supabase/database.types.ts` already serves as the source of truth and is verified via `vitest` + `quickstart.md` curls. Full OpenAPI generation (via `redocly` or `swagger-cli validate`) is scheduled for `009-polish` follow-up (see `plan.md` Tech Debt). For now, each stub is marked non-blocking WARNING W1 in `verify-report.md:192`.

To generate real specs:
```bash
npx swagger-cli validate specs/009-customer-360/contracts/api-client-me.yaml
# or use Zod-to-OpenAPI on app/api/client/me/route.ts
```

Until then, treat `contracts/*.yaml` + `data-model.md` + Zod schemas as the authoritative contract.
