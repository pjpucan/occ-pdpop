# PDP — Church Population Database

An internal web app for **Oaks Community Church** that tracks the congregation
(members, guests and first-timers), takes attendance at Sunday services and Bible
studies, and produces monthly reports. That includes the **Empower Global
Statistical Report**, which the church submits to its network each month.

Built with [Nuxt 4](https://nuxt.com) (Vue 3), Tailwind CSS, Prisma and PostgreSQL.

## Features

| Page | Path | What it does |
| --- | --- | --- |
| **Members** | `/` | The population database. Lists everyone with their category, Bible study group, volunteer ministry and type (Member, Visitor or Bible Study), 50 per page. The **Bible study** column shows "Yes ⓘ" for anyone in a group; clicking ⓘ shows their leader. The **Members in a Bible study group** card shows how many members (the population) are in a group vs. not, with percentages and a bar. Search by name, filter by category, Bible study (In a group / Not in a group), ministry and type (Visitor, Member, Bible Study, Inactive), and export the filtered list to Excel (`PDP-export-YYYY-MM-DD.xlsx`). |
| **Attendance** | `/attendance` | Create events (a Sunday **Service**, morning or afternoon, or a **Bible Study**) and check people in. For services you can record the preacher, sermon topic and key verses. For Bible studies you can record a facilitator and co-facilitator. New guests and first-timers can be added straight from the check-in screen. |
| **Bible Study** | `/bible-study` | Manage Bible study groups (by leader) and see who belongs to each one. |
| **Reports** | `/reports` | Monthly attendance summary: totals per Sunday (AM/PM), and service and Bible study attendance by category. Each category has a drill-down showing the members behind the number. |
| **Empower Report** | `/empower-report` | Builds the Empower Global Statistical Report for a month and downloads it as a formatted `.xlsx` (`Empower-Statistical-Report-YYYY-MM.xlsx`). |

### Member categories

`Kids`, `Tweens`, `YTH`, `NXT`, `Solo`, `Senior Adult`, `Young Couples`, `Couples`,
`Legacy` and `Unassigned`.

### People types

Everyone in the database has one **Type**, chosen in the Add/Edit forms:

| Type | Who | Counts in population? |
| --- | --- | --- |
| **Member** | Part of the congregation | Yes (unless Inactive) |
| **Visitor** | Attends services but isn't a member | No |
| **Bible Study** | Attends only a Bible study | No |

Members and Bible Study people can both have a Bible study leader. For Bible
Study people, a **Leader** dropdown appears right next to **Type** in the forms
(the list comes from the Bible Study page's groups). Members answer
"In Bible study?" first, then search for a leader. Visitors and Bible Study people don't get the
Volunteer/Ministry fields.

In the database, Visitor and Bible Study are both stored as `isVisitor = true`,
told apart by `guestType` (`VISITOR` or `BIBLE_STUDY`). Older records with no
`guestType`, or the retired `MEMBER` guest type, are treated as Visitors.

### Who counts in the population

Only **active members** count toward the population, on both the Members page
(Total population and Regular gathering cards) and the Empower report (EPOP):

- **Visitors and Bible Study people** are never counted in the population.
  They still appear in the Visitors card and in the Empower report's First
  Timer and Bible Study attendee columns.
- **Inactive members** aren't counted either (see below).

### Inactive members

A member is marked **Inactive** once they've gone **3 months without attending a
single Sunday service**. Nothing is deleted. The logic lives in
`server/utils/activity.ts`.

- The 3 months count from the latest of: their last Sunday service, when they
  were added, or when an admin last re-enabled them. So someone who was just
  added, or the imported roster (added Sep 16, 2026), isn't flagged straight away.
- Inactive status is worked out each time the data is loaded, not stored, so
  checking someone in at a Sunday service makes them active again automatically.
- On the Members page, inactive rows are greyed out with an **Inactive** badge.
  Hovering the badge shows their last service date. Pick **Inactive** in the
  type dropdown to list only them.
- Admins can click **Enable** on an inactive member to give them a fresh 3 months
  (this sets `Member.reactivatedAt`).
- Visitors and Bible Study people are never marked Inactive.
- Inactive members still appear in the Attendance check-in list so they can be
  checked in.

### How the Empower report is calculated

The logic lives in `server/utils/empowerReport.ts`.

- **Cut-off periods** are Monday–Sunday weeks. A week belongs to the month that
  contains its Sunday, so a month's first week can start in the previous month.
- **Category columns** follow the Empower template: `Solo` → "Solo Parent",
  `Young Couples` and `Couples` are combined into "Couples", and `Unassigned`
  members are left out of the population and shown as a warning instead.
- **Population (EPOP)** is the existing member base plus any first-timers added
  through the app up to the end of each week, leaving out guests and anyone who
  was inactive *as of that week* (no Sunday service in the 3 months before it).
  The imported roster counts as the starting population for earlier months too.
  Weeks that haven't finished yet show no population figures.
- **Running Total** is that week's EPOP minus the people who attended *both* a
  service and a Bible study that week, so nobody is counted twice.
- **First timers** are counted separately for official activities and for Bible
  study, based on the guest type chosen when the person was added.

## Logins and roles

There are two shared logins, set in `server/utils/auth.ts`:

- **admin** can do everything, including editing and deleting members, deleting
  events, and managing Bible study groups.
- **user** can view everything, take attendance and add people, but can't edit or
  delete existing records.

Sessions use a signed, httpOnly cookie (`occ_session`) that lasts 30 days. Every
`/api/*` route except `/api/auth/*` requires a valid session
(`server/middleware/auth.ts`). Pages redirect to `/login` when you're signed out
(`app/middleware/auth.global.ts`).

> The passwords and the cookie-signing secret are hard-coded in
> `server/utils/auth.ts`. Change them there; don't copy them into docs or tickets.

## Getting started

### Prerequisites

- Node.js 20+
- A PostgreSQL database (local, or hosted such as Supabase or Neon)

### 1. Install

```bash
npm install
```

`postinstall` runs `prisma generate` and `nuxt prepare` for you.

### 2. Configure the environment

Copy `.env.example` to `.env` and fill in:

```env
# Connection used by the app at runtime (can be a pooled URL)
DATABASE_URL=postgresql://user:password@host:5432/dbname
# Direct (non-pooled) connection used by Prisma migrations
DIRECT_URL=postgresql://user:password@host:5432/dbname
```

For a local database without a connection pooler, both can be the same URL.

> **Supabase:** `DATABASE_URL` points at the transaction pooler (port 6543).
> Because `prisma.config.ts` reads `DATABASE_URL`, `prisma migrate` connects
> through the pooler too, and it **hangs** there. Run migrations against the
> direct connection instead:
>
> ```bash
> DATABASE_URL="$(grep '^DIRECT_URL=' .env | cut -d= -f2- | tr -d '"')" npx prisma migrate deploy
> ```

### 3. Set up the database

```bash
npx prisma migrate deploy   # apply the migrations in prisma/migrations
npx prisma db seed          # optional: import the starting member list
```

The seed script (`prisma/seed.ts`) loads members from `prisma/members.json`,
creating their Bible study groups and volunteer records as it goes. It only
inserts, so run it **once** on an empty database or you'll get duplicates.

### 4. Run

```bash
npm run dev       # http://localhost:3000
```

## Scripts

| Command | Description |
| --- | --- |
| `npm run dev` | Start the dev server with hot reload |
| `npm run build` | Build for production |
| `npm run preview` | Preview the production build locally |
| `npm run generate` | Static generation (not used, because the app needs its API server) |
| `npx prisma studio` | Browse and edit the database in a GUI |
| `npx prisma migrate dev --name <name>` | Create a new migration after changing `schema.prisma` |

## Project structure

```
app/
  app.vue                 Top navigation + logout
  pages/                  One page per route (thin wrappers)
  components/             Main UI: PDP (members), Attendance, BibleStudy,
                          Reports, EmpowerReport
  composables/useAuth.ts  Current role / isAdmin helpers
  middleware/             Client/SSR login redirect
server/
  api/auth/               login, logout, me
  api/members/            CRUD for members, plus [id]/reactivate (re-enable an
                          inactive member)
  api/events/             Events + per-event attendance
  api/bible-study-groups/ CRUD for Bible study groups
  api/reports/            monthly, empower (JSON), empower-export (xlsx)
  middleware/auth.ts      Requires a session on every API route
  utils/                  prisma client, auth, date helpers, Empower report logic,
                          inactive-member rule (activity.ts), preacher list
prisma/
  schema.prisma           Data model
  migrations/             SQL migrations
  seed.ts, members.json   Initial member import
```

### Data model (summary)

- **Member**: a person, with a category, leader status, and guest flags
  (visitor, guest type, first-timer, walk-in, invited by), an optional birthday,
  and `reactivatedAt` (when an admin last re-enabled them after being Inactive).
- **BibleStudyGroup** / **BibleStudyMembership**: each member belongs to at most
  one group.
- **VolunteerRecord**: the ministry a member serves in.
- **Event**: a `SERVICE` (with `MORNING`/`AFTERNOON` session, preacher, topic and
  key verses) or a `BIBLE_STUDY`.
- **Attendance**: one row per member per event, with an optional Bible study role
  (`FACILITATOR` / `CO_FACILITATOR`).

Deleting a member also deletes their attendance, Bible study membership and
volunteer record.

## Common customizations

- **Preacher options**: `server/utils/preacher.ts`
- **Church name on the Empower report**: `computeEmpowerReport` in
  `server/utils/empowerReport.ts`
- **Login credentials**: `server/utils/auth.ts`
- **How long before a member is Inactive**: `INACTIVE_MONTHS` in
  `server/utils/activity.ts`
- **Members per page**: `PAGE_SIZE` in `app/components/PDP.vue`

## Deployment

Any Node host that can run a Nuxt server build will work. The Prisma client is
also built for `rhel-openssl-3.0.x`, which covers serverless platforms such as
Vercel. Set `DATABASE_URL` and `DIRECT_URL` in the host's environment and run
`npx prisma migrate deploy` against the production database before (or as part
of) each release that includes new migrations.

## Changelog

### 2026-10-08

- **Members table:** removed the **Bible study** column and the **Bible study**
  filter (later restored, see above). The leader info icon moved into the Member column in blue. It only
  shows only for **Bible Study** people who have a leader assigned, right after
  their badge. Members don't show it.
- **Bible Study people can now have a leader.** In the Add/Edit and Attendance
  "add person" forms, choosing **Bible Study** as the Type shows a **Leader**
  dropdown right next to it (before, the leader was hidden and cleared on save).
- **Bible study column and filter are back** ("Yes ⓘ" with the leader tooltip,
  and the In a group / Not in a group filter). They show anyone in a group,
  Members and Bible Study people alike. The ⓘ was removed from the **Bible
  Study** type badge in the Member column; that badge is now just a label.
- **"In Bible study" card is now "Members in a Bible study group".** It counts
  active Members only (not Visitors or Bible Study-type people), shows them as
  "X of Y · N%", adds a progress bar, and shows how many are not in a group.
- **Leader tooltip** now opens centered over the ⓘ icon, with its arrow pointing
  straight down at it.

- **"Guest" renamed to "Visitor"** everywhere on screen: the Type dropdown, the
  Members filter, the table badge and the stats card. Bible-study-only people
  now get their own blue **Bible Study** badge. The type filter's **Visitor**
  option now shows Visitors only (Bible Study people have their own option).
  The stats card is now **Visitors**, with the Bible Study count shown beside
  it. The Excel export's Guest (Yes/No) column is now **Type**
  (Member / Visitor / Bible Study).

- **Add/Edit member and Attendance "add person" forms:** the Guest checkbox and
  the separate guest-type dropdown are replaced by one **Type** dropdown:
  Member, Visitor or Bible Study. Choosing Visitor shows the First
  Timer / Walk-in / Invited by fields. Choosing Bible Study hides the member-only
  fields (Bible study group, volunteer, ministry). Existing guests with no guest
  type, or the old "Member" guest type, show as Visitor and are saved that
  way the next time they're edited.

### 2026-10-07

- **Members page:** added pagination (50 per page).
- **Members page:** the type dropdown has new **Bible Study** (Bible-study-only
  guests) and **Inactive** options. Its default label and the table column are
  now "Member" instead of "Guest".
- **Population:** Total population, Regular gathering and the Empower report's
  EPOP now count active members only. Guests and inactive members are excluded.
- **Inactive members:** members with no Sunday service in 3 months are marked
  Inactive, and admins can re-enable them. Adds the `Member.reactivatedAt`
  column (migration `20261007120000_add_member_reactivated_at`).
- **Excel export:** added a Status column (Active / Inactive).
- **README:** replaced the Nuxt starter README with this one.
