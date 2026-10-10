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

Members who haven't attended a Sunday service in **3 months** are marked
**Inactive**. They aren't deleted, and they leave the population count until
they attend again or an admin re-enables them.

### Attendance
Create Sunday Celebration (morning/afternoon) and Bible Study events and check
people in. Services record the preacher, sermon topic and key verses. Bible
studies record the facilitator, co-facilitator and a session or group title.
Events are listed in separate Sunday Celebration and Bible Study tables,
grouped by week.

### Bible Study
Manage the Bible study groups and their leaders.

### Reports
A monthly attendance summary: totals per Sunday (morning/afternoon), and
service and Bible study attendance by member category. It also lists the
month's first timers and how they found the church: invited by someone, or a
walk-in who heard about Oaks on Facebook, Instagram, YouTube or elsewhere.

### Empower Report
Builds the monthly Empower Global Statistical Report (first timers, running
total, Bible studies conducted, attendees, and population by category) and
downloads it as a formatted Excel file. Only active members count toward the
population.

## Who can use it

There are two logins. **Admin** can do everything. **User** can view
everything, take attendance and add people, but can't edit or delete existing
records.

## Built with

Nuxt (Vue), Tailwind CSS, Prisma and PostgreSQL.
