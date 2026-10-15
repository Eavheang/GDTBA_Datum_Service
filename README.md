# GDTBA Datum Service

Hono API on Bun for converting coordinates between **Indian 1960** and **WGS84** in UTM zone **48N** (Cambodia). It owns the conversion math, ported from the client's `Indian60_Converter_Template.xlsm` VBA macro, so the numbers match the spreadsheet.

```sh
bun install
cp .env.example .env   # fill SUPABASE_SERVICE_ROLE_KEY
supabase db push       # apply supabase/migrations (profiles table + triggers) to the linked project
bun run dev      # http://localhost:8000 (PORT overrides)
bun test         # geodesy, MGRS, lat/lon, CSV and route tests
```

## Routes

| Method | Path                          | Body and result                                                                                                  |
| ------ | ----------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| GET    | `/health`                     | `{ ok: true }`                                                                                                   |
| POST   | `/converter/convert`          | `{ from, to, rows: [{ E, N }] }` returns `{ results }`, one per row: `{ out, warn, deg }`, `{ error }` or `null` |
| POST   | `/converter/export`           | Same body; returns the converted rows as the `to` system's template CSV (attachment)                             |
| POST   | `/converter/import`           | Raw CSV text; returns `{ ok, system, rows, skipped }` or `{ ok: false, found, expected }`                        |
| GET    | `/converter/template/:system` | Empty template CSV for one system (attachment)                                                                   |
| GET    | `/admin/users`                | Admin only. `{ users: [{ id, email, role, createdAt, lastSignInAt }] }`                                          |
| POST   | `/admin/users`                | Admin only. `{ email, password, role }` creates a confirmed user                                                 |
| PATCH  | `/admin/users/:id`            | Admin only. `{ role }`                                                                                           |
| DELETE | `/admin/users/:id`            | Admin only.                                                                                                      |

Every route except `/health` needs `Authorization: Bearer <Supabase access token>` of a live user (401 otherwise); `/admin/*` also needs `public.profiles.role` = `admin` (403). Without Supabase env vars guarded routes return 503.

Systems: `wgs84`, `indian60`, and each with `-mgrs`, `-dd`, `-dms` or `-ddm`. `deg` is the input point as WGS84 `[lat, lon]`, for plotting.

## Layout

```
src/index.ts              Bun server entry
src/app.ts                Hono app: middleware, auth guard, error handlers, mounted feature routers
src/middleware/auth.ts    Supabase client, requireUser / requireAdmin, shared factory
src/converter/routes.ts   converter routes (zod-validated)
src/converter/*.ts        conversion logic, plain TypeScript with tests beside it
```
