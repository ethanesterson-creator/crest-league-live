# Schema tracking

`migrations/` holds every schema/policy change made to the production
database, as plain SQL files, applied by hand via the Supabase dashboard's
SQL editor. There's no service-role key or Supabase CLI project link set
up yet, so nothing here runs automatically — this is a record and a
review step, not real migration tooling (yet).

**Going forward:** before changing anything in the dashboard, write the
SQL as a new file here first — `NNNN_short_description.sql`, next number
after whatever's already here. Apply it in the dashboard, then commit the
file. That's the whole process. It turns "I changed something in Supabase
once and don't remember exactly what" into a real, reviewable history.

## What's missing: a real baseline

`migrations/0001_harden_admin_access.sql` is the first *tracked* change,
but it's not a full schema baseline — everything that existed before it
(all 12 tables, their real column types/constraints/indexes, the RPC
function bodies) was never captured anywhere, including in this repo.
`CLAUDE.md`'s table list was reconstructed empirically by sampling rows
over the REST API, which tells you column *names* but not real types,
defaults, or constraints — it's not authoritative.

To get a real baseline (one-time setup, needs your Supabase login, not
something achievable from just the anon key already in `.env.local`):

```bash
npx supabase login
npx supabase link --project-ref cgalbloauxkmtntfxjxq
npx supabase db pull
```

That generates a real `supabase/migrations/<timestamp>_remote_schema.sql`
from the actual database. Commit that as the true starting point, and
everything after it (including 0001 above) becomes a real, complete
history instead of a partial one starting mid-story.
