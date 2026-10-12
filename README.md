# PDP — Church Population Database

PDP is an internal web app for **Oaks Community Church**. It keeps track of the
congregation, records who attends Sunday services and Bible studies, and
produces the monthly reports the church needs, including the **Empower Global
Statistical Report** that's submitted to the church's network every month.

## What it does

### Members
The database of everyone connected to the church. Each person has one **type**:

- **Member**: part of the congregation, and counts in the church population.
- **Visitor**: attends services but isn't a member.
- **Bible Study**: attends only a Bible study, with an optional group leader.

You can search, filter (by category, Bible study group, ministry and type) and
export the list to Excel. Summary cards show the total population, how many
members are in a Bible study group vs. not, and how many visitors and Bible
Study people there are.

Members who haven't attended a service (Sunday Celebration, Midweek Service,
Prayer Meeting or Prayer & Fasting) in **3 months** are marked **Inactive**.
They aren't deleted and are still searchable; they just leave the Members
page's population count. They become active again automatically when they're
checked in to one of those services, or when an admin re-enables them.

### Attendance
Create events and check people in: Sunday Celebration (morning/afternoon),
Bible Study, and other gatherings (Midweek Service, Prayer Meeting, Prayer &
Fasting, Kids Service). Services and gatherings record the preacher, topic and
key verses. Bible studies record the facilitator, co-facilitator and a session
or group title. Events are listed in separate Sunday Celebration, Bible Study
and Other Gatherings tables, grouped by week.

### Bible Study
Manage the Bible study groups and their leaders.

### Reports
A monthly attendance summary: totals per Sunday (morning/afternoon), and
service and Bible study attendance by member category. It also lists the
month's first timers and how they found the church: invited by someone, or a
walk-in who heard about Oaks on Facebook, Instagram, YouTube or elsewhere.

### Empower Report
Builds the monthly Empower Global Statistical Report and downloads it as a
formatted Excel file, following the Empower guidelines:

- **Running Total**: everyone who attended the church's gatherings that week
  (Sunday Celebration, Midweek, Prayer Meeting, Prayer & Fasting, Kids Service).
- **EPOP**: starts from the previous month's ending EPOP and grows each week by
  that week's first timers (general and Bible Study). Total EPOP is the sum of
  all category columns, including Solo Parent.
- **Previous month ending** (BASE row): the previous month's latest EPOP,
  Running Total, Bible Studies conducted and Bible Study attendees.

## Who can use it

There are two logins. **Admin** can do everything. **User** can view
everything, take attendance and add people, but can't edit or delete existing
records.

## Built with

Nuxt (Vue), Tailwind CSS, Prisma and PostgreSQL.
