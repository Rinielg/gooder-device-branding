-- Extensions and shared helpers.
--
-- `moddatetime` keeps `updated_at` honest: the client never writes it, so it
-- cannot lie about when a row changed. It lives in `extensions` on Supabase,
-- which is why every trigger below names the schema.

create extension if not exists moddatetime with schema extensions;
