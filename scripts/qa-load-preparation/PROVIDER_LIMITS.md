# Current documented provider limits — public-document review only

Retrieved October 9, 2026, Saudi Arabia time (the receipt timestamps are UTC October 8). No project/API/Auth endpoint was queried; these are provider documentation defaults, NOT observed limits of the authorized target. `provider-sources.json` and saved text contain the retrieval receipts. Target subscription, runtime/PostgREST version, custom rate-limit settings, compute size and database configuration remain unmeasured.

## Auth

The current Auth documentation gives `/auth/v1/token` a default of 150 requests per five minutes per IP, with a burst of 30, covering password, refresh, ID-token and PKCE grants.[1]
The sign-up/sign-in row lists `/auth/v1/user` among its paths and gives a default of 30 requests per five minutes with a burst of 30; the table does not distinguish GET from update methods, so do not assert that every native `getUser` GET shares that exact quota without applicable implementation/configuration or observed evidence.[1]
IP-limited operations use token buckets and return HTTP 429 when exhausted.[1]

Provision and verify the 50 dedicated identities before the pressure round, respecting ordinary documented admission windows; no login or automatic refresh occurs inside load. No retry of rejected requests, IP forwarding, proxy rotation, policy changes or quota purchases is implemented. The application list handler calls `db.auth.getUser(token)` for every application HTTP request (current main `transactions-api/index.ts:127-137`), so the native stage includes an Auth dependency; a 429 returned inside the application must not be mislabeled as a proven Cloudflare limit. HTTP statuses identify observations, not necessarily the responsible provider.

## Supabase Edge Functions

Hosted limits are 256 MB memory, worker lifetime 150 seconds on Free or 400 seconds on paid plans, two seconds CPU per request, and a 150-second request idle timeout returning 504.[2]
These limits do not establish a universal simultaneous-request cap of 50, 80 or 2500.[2]
The runner's 30-second request, 15-second absolute body, 10-second drain and 55-second round deadlines are deliberately stricter local execution deadlines, not provider limits.

## Cloudflare

Workers Free has a 100,000-request daily limit; the current plan table lists paid requests without that daily limit, 128 MB memory, and CPU limits of 10 ms Free / five minutes paid.[3]
The six-connection limit is **outgoing connections waiting for response headers per Worker invocation**, not six incoming clients; after response headers that connection no longer occupies that six-connection category.[3]
Pages Functions requests count toward Workers plan quota.[4]

This prepared native load calls the reviewed Supabase application list route, not Cloudflare Pages assets. It therefore is NOT a Cloudflare frontend/Pages performance measurement. No guessed Pages incoming concurrency cap is reported. Native browser frontend journeys and any independently approved frontend workload remain separate acceptance work.

## PostgREST / database

The fetched stable documentation identifies itself as PostgREST 16. Its `db-pool` default is 10 database connections and `db-pool-acquisition-timeout` default is 10 seconds; these are upstream defaults, not readback of Supabase's configuration.[6]
Its error reference maps PGRST003 (pool acquisition timeout) to 504, and PGRST000/001/002 database connection failures to 503.[5]
A configured connection pool size is not an HTTP concurrency cap. Supabase describes dedicated project PostgreSQL instances with compute-dependent memory/CPU and disk performance; the actual project compute size and bottlenecks were not inspected.[7]

No real PostgreSQL, PostgREST, Auth, Edge or provider timing result is available from this local HTTP fixture. Local measured socket/HTTP values are reported separately. If the native phase encounters a genuine provider limit, preserve actual attempted/sent/completed shape and statuses, stop further ramp rounds, and document the limitation without evasion.

## Sources

[1] https://supabase.com/docs/guides/auth/rate-limits
[2] https://supabase.com/docs/guides/functions/limits
[3] https://developers.cloudflare.com/workers/platform/limits
[4] https://developers.cloudflare.com/pages/platform/limits
[5] https://docs.postgrest.org/en/stable/references/errors.html
[6] https://docs.postgrest.org/en/stable/references/configuration.html
[7] https://supabase.com/docs/guides/platform/compute-and-disk
