-- Enable Row-Level Security on every table in the public schema.
-- The app accesses the database only through Prisma as the `postgres` role,
-- which bypasses RLS. With no policies defined, Supabase's public Data API
-- (anon / authenticated roles) can no longer read or write these tables.
ALTER TABLE "Member" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "BibleStudyGroup" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "BibleStudyMembership" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "VolunteerRecord" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Event" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Attendance" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "_prisma_migrations" ENABLE ROW LEVEL SECURITY;
