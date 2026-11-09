# Creator Studio: architecture

A shared workspace between a creator (the client) and their marketing team. The system is built so that adding a client is one form away.

## 1. Stack

| Layer | Choice | Why |
|---|---|---|
| App | Next.js 16, React 19, TypeScript | One codebase for both portals, with server rendering so internal data never reaches a client's browser |
| Database | PostgreSQL with Drizzle ORM | Real relational records. Runs locally today and moves to Neon or Supabase by changing one URL |
| File storage | Two drivers behind one interface: local disk and any S3 service (Cloudflare R2, AWS S3, Supabase Storage) | Works today with no account. Moving to the cloud is a settings change |
| Uploads | Browser sends the file directly to storage using a short-lived signed URL, then the server checks it arrived | Large videos do not pass through the app server, and a file is never marked uploaded unless it exists |
| Sign-in | Own email and password, hashed sessions, invite links | No third-party account needed |
| AI | Claude Opus 5.5 through the Anthropic SDK, streamed | Reads the brand knowledge base and the workspace's own content |
| Tests | Playwright in a real browser | Proves upload, playback, drag and drop and permissions end to end |

## 2. User roles

| Role | Who | Can do |
|---|---|---|
| Agency admin | Agency owner | Everything, in every workspace. Adds clients and team members |
| Agency member | Editors, writers | Everything inside the workspaces they are assigned to |
| Client | The creator | Their own portal only. Uploads, ideas, review, approval, read-only calendar and feed |

**Access rules, enforced on the server for every read and write**

- Every record belongs to one workspace. A user with no membership gets a 404, so another client's workspace cannot even be detected.
- Clients never receive internal notes, internal comments, team tasks, team-only activity or unreleased files. These are left out of the query, not hidden in the page.
- Files are served through a permission check. Team uploads stay private until the piece is sent to the client.
- The nine production statuses are translated into simple words for the client. The client never sees the internal workflow.

## 3. Database schema

| Table | Holds |
|---|---|
| users, sessions, invites | People, sign-in sessions, single-use invite and reset links |
| workspaces | One per client: Instagram profile details, pillars |
| memberships | Who belongs to which workspace, and as what |
| assets | Every file and link: title, description, category, tags, status, visibility, uploader, upload date, internal notes, plus file details |
| content_items | Each piece: title, pillar, format, status, brief, script, caption, internal notes, schedule, publishing link, review round |
| content_assets | Links files to a piece, by role: voiceover, raw footage, edited video, cover, reference |
| content_revisions | Numbered history of scripts, captions, edits and covers |
| approvals | Every approve, reject and revision decision, by round |
| comments | On a piece or a file, optionally pinned to a moment in the video, optionally team-only |
| creative_requests | Share an Idea submissions |
| tasks | Team to-dos. Every request creates one automatically |
| feed_layouts, feed_slots | Saved feed versions and the tiles inside each one |
| activity | Full log of comments, edits and approvals |
| notifications | In-app alerts per person |
| content_metrics, follower_snapshots | Performance numbers per piece, follower count over time |
| brand_docs | The brand knowledge base the AI reads |
| ai_threads, ai_messages | Saved assistant conversations |

## 4. Page structure

**Client portal, `/w/<client>`**

| Page | What the client does |
|---|---|
| Home | A screen of boxes showing what is inside each area: Review, Feed preview, Current feed, Share an idea, Videos, Photos, Voice, References, Scripts, Brand identity, Calendar, In the making, Results, All files |
| Videos, Photos, Voice, References | Opens a folder and drops files straight into it |
| Scripts | Reads scripts and captions once they are ready for the client |
| Brand identity | Sees colours, fonts, logos and the sections the team chooses to share |
| Results | Sees how their posts are doing |
| Send files | Drags in voiceovers, footage, photos, references and links, with instructions |
| Share an idea | Submits a creative request. Sees past ideas and where they went |
| Review | Watches the edit, comments on exact moments, approves, rejects or asks for changes |
| In the making | Follows every piece in simple words |
| Calendar | Sees what is going out and when |
| Feed | Sees planned posts beside what is live on the profile now |
| My files | Finds, plays and downloads everything they have sent |
| Notifications | Everything that needs their attention |

**Agency portal, `/admin`**

| Page | What the team does |
|---|---|
| Clients | Sees all clients, adds a new one, invites people |
| Home | A screen of boxes for every area, with anything needing a decision above them |
| Videos, Photos, Voice, References | Opens a folder and drops files straight into it |
| Scripts | Sees which pieces still need words, and everything already written |
| Library | Searches and filters all files. Incoming files show as New. Upload, play, download, annotate |
| Pipeline | Moves pieces across the nine statuses by drag and drop |
| Content detail | Script, caption, all files, comments, revisions, approvals, schedule and publishing link |
| Calendar | Schedules pieces and reschedules them by drag and drop |
| Feed planner | The current live grid beside a three-column profile preview. Upload into tiles, rearrange, 9, 12 and larger views, saved versions, drafts and planned posts |
| Requests and Tasks | Works through client ideas and team to-dos |
| Reports | Enters numbers and sees saves, shares, non-follower reach and follows |
| Assistant | The nine AI jobs, connected to the brand knowledge base |
| Brand identity | Sets colours, fonts and logos, edits the knowledge base, chooses what the client sees |
| Team | Manages who has access to the workspace |

## 5. Build order

1. Foundation: database, sign-in, roles, workspaces, invites, storage
2. Client upload experience
3. Media library
4. Content production pipeline and detail pages
5. Instagram feed planner
6. Review, approvals, comments, notifications
7. Creative requests and tasks
8. Calendar and reports
9. AI brand assistant

## 6. Known limits of the first version

- **Instagram:** the feed planner and reports do not connect to Instagram. The current feed is added by hand, numbers are typed in and posting stays manual. A live connection needs Meta app review.
- **Email:** notifications are in-app. Email alerts need a sending service.
- **iPhone HEIC photos:** they upload, store and download fine, but only Safari can preview them.
- **Video over 5 GB:** single uploads are capped at 5 GB. Anything larger needs multipart uploads.

## 7. How it was checked

- **Real browser tests:** 28 flows covering both portals, run against a real server and database. They include uploads, playback, downloads, drag and drop, approvals, and isolation between clients.
- **Large files:** a 1.5 GB upload arrived byte-identical, with the server peaking at about 340 MB of memory.
- **Cloud storage:** the same flows pass on a local S3-compatible server. They have not yet run against a real Cloudflare R2 or AWS bucket.
- **AI assistant:** tested against a stand-in for the Claude API, which confirms what is sent and how answers are handled. It has not yet run against the live API.
