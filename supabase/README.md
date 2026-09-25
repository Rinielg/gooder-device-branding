# Supabase

The schema from [`docs/DATABASE.md`](../docs/DATABASE.md), as migrations.

Nothing in the app talks to it yet. These build the database; wiring the editor
to it is the next job, and `docs/DATABASE.md` has the order to do it in.

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
