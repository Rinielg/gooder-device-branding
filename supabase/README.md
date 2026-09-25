# Supabase

The schema from [`docs/DATABASE.md`](../docs/DATABASE.md), as migrations.

The editor is wired to it: sign in by email link, save a project to your
account, open one from the list, and autosave with conflict detection. Media is
not — uploads are still `blob:` URLs, and the `assets` table is waiting for the
document to carry asset ids instead.

## Pointing the editor at it

Two variables, in `app/.env.local` for development and in the Vercel project's
environment for the deployed build:

    VITE_SUPABASE_URL=...
    VITE_SUPABASE_ANON_KEY=...

`npm run db:start` prints both for the local stack. **Without them the editor
runs exactly as it did before any of this existed** — one project, in the
browser — and the client is not even bundled, because Vite inlines the missing
variables and the branch that builds it is provably dead. That is 218 KB a
build with no database does not carry, and it is why the deployed site is
unaffected until you choose otherwise.

The anon key is meant to be public. The service role key is not, and must never
appear in anything `VITE_` prefixed — that prefix is what puts a value in the
browser bundle.

Sign-in links go to `site_url` unless the origin is in
`additional_redirect_urls`. Both are set in `config.toml`; add any new origin
there or the link will look broken.

## Running it

Every command is an npm script in `app/`, so the pinned CLI is used rather than
whatever is on your PATH.

```bash
npm run db:start    # starts Postgres, Auth, Storage and Studio in Docker
npm run db:reset    # drops everything and re-applies every migration
npm run db:test     # the RLS suite — two users, asserting they stay apart
npm run db:types    # regenerates src/state/database.types.ts from the schema
npm run db:stop     # stops the containers
```

Studio is at http://127.0.0.1:54323 while it is running. The database is at
`postgresql://postgres:postgres@127.0.0.1:54322/postgres`.

## Going to a real project

```bash
npx supabase link --project-ref <ref>
npx supabase db push
```

`db push` applies only the migrations the remote has not seen. Never edit a
migration that has been pushed — add another.

## The migrations

| | What it creates |
|---|---|
| `…120000_extensions` | `moddatetime`, so `updated_at` is never the client's word |
| `…120100_profiles` | One row per account, created by a trigger on `auth.users` |
| `…120200_projects` | The document, its promoted columns, and the owner policies |
| `…120300_project_versions` | History and autosave, pruned to twenty per project |
| `…120400_assets` | Uploaded media by reference, so the document holds ids |
| `…120500_angle_presets` | The angle library, with a `tsvector` over name and description |
| `…120600_exports` | What was rendered, for plan limits to count |
| `…120700_billing` | The Stripe mirror: customers, products, prices, subscriptions |
| `…120800_plans` | Plans, limits, and the trigger that enforces them |
| `…120900_storage` | Four private buckets and their folder policies |

## Two things that are easy to get wrong

**The service role bypasses RLS.** The Stripe webhook handler uses it, and
nothing else does. That key never reaches a browser.

**`db:test` is not optional.** Wrong RLS is a breach, and a policy that says
`owner_id` and one that says `auth.uid()` look alike and behave nothing alike.
The suite creates two users and asserts that each one sees, writes and deletes
only their own rows — including that a project cannot be created in someone
else's name, that a stale save changes nothing, that the project limit is
refused by the database rather than the interface, and that a user cannot ask
what somebody else is paying for.

Run it after any change to a policy.
