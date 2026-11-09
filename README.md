# Creator Studio

A shared workspace between a creator and their marketing team. One app with two portals: a simple one for the client at `/w/<client>`, and a full one for the team at `/admin`. Adding a client takes one form on `/admin`, or a seed file.

The design and data model are in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Run it

Needs Node and Postgres.

```bash
npm install
cp .env.example .env              # then set APP_SECRET: openssl rand -hex 32
createdb creator_studio
npm run db:migrate
cp seed.example.json seed.local.json   # optional: edit it with your client's details
npm run seed                      # creates the workspace from seed.local.json. No file, nothing created.
npm run bootstrap -- --email you@example.com --name "Your Name"   # prints a link to set your password
npm run build && npm start        # http://localhost:3100
```

Or run everything in one go, with a database of its own on this machine: `npm run studio`.

### Client data stays out of this repo

`seed.local.json` is git-ignored. To keep a client's seed file somewhere else, such as a private repo, point at it with `SEED_FILE=path/to/client.json npm run seed`. The format is in `seed.example.json`. Seeding is safe to run twice: an existing workspace is left alone.

## Tests

Everything runs in a real browser against a real server, a separate database (`creator_studio_test`) and real files. The tests seed a made-up client from `e2e/seed.fixture.json`. The Claude API is replaced by a local stand-in that records what it receives, so tests cost nothing. Needs `ffmpeg`.

```bash
createdb creator_studio_test
npx playwright install chromium
npm run build && npm run test:e2e
```

To run the same tests on S3-style storage, start a local S3 server and set `E2E_STORAGE=s3`:

```bash
npx s3rver -d /tmp/s3 -p 4568 --no-vhost-buckets --configure-bucket studio docs/s3-cors.xml
E2E_STORAGE=s3 npm run test:e2e
```

## Going live (Netlify and Neon)

`netlify.toml` holds the build settings: command `npm run build`, publish `.next`, Node 22, and the Next.js runtime.

1. **Database:** put Neon's pooled connection string in `.env` as `DATABASE_URL`, then run `npm run db:migrate`, `npm run seed` and, for each admin, `APP_URL=https://your-site.netlify.app npm run bootstrap -- --email ... --name ...`. Migrations switch to Neon's direct host (without `-pooler`) on their own.
2. **Netlify environment variables:** `DATABASE_URL` (the same pooled string), `APP_URL` (the https address), `APP_SECRET` (a long random string) and `STORAGE_DRIVER=off`. Optionally `NEXT_PUBLIC_STUDIO_NAME` for the name in the browser tab. Sign-in cookies turn secure on their own over https.
3. **Files:** with `STORAGE_DRIVER=off` nothing is written to the server and upload buttons say "Uploads coming soon". `s3` also works: create a bucket, apply `docs/s3-cors.xml` with the site's address in place of `*`, and set the `S3_*` values. `local` is for a laptop only.
4. **Assistant:** set `ANTHROPIC_API_KEY`. Without it the assistant page says it is not connected, and everything else still works.

Video frame analysis in the assistant needs `ffmpeg` on the server. Without it (as on Netlify) the assistant sees one cover frame per video, and it is told so.

## How the rules are enforced

- **Workspace access:** every page and action goes through `requireWorkspace` or `requireTeam` in `src/lib/auth.ts`. No access returns a 404.
- **What a client can see:** client pages only use the reads in `src/lib/queries.ts` that leave out team-only data, so it never reaches the client's browser. The file route `src/app/api/assets/[id]/file/route.ts` checks permission again on every request.
- **Uploads:** the browser sends files straight to storage with a signed link. `src/app/api/uploads/[id]/complete/route.ts` then checks the bytes arrived before the file counts as uploaded.
- **Approvals:** the status rules live in `statusProblem` in `src/lib/actions/content.ts`. Changing the script, caption, edit or cover of approved work sends it back to Internal Review.
