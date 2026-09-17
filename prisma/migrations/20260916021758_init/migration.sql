-- CreateEnum
CREATE TYPE "Category" AS ENUM ('KIDS', 'TWEENS', 'YTH', 'NXT', 'SOLO', 'SENIOR_ADULT', 'YOUNG_COUPLES', 'COUPLES', 'LEGACY', 'UNASSIGNED');

-- CreateEnum
CREATE TYPE "LeaderStatus" AS ENUM ('NONE', 'POTENTIAL', 'ACTIVE');

-- CreateTable
CREATE TABLE "Member" (
    "id" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "category" "Category" NOT NULL,
    "leaderStatus" "LeaderStatus" NOT NULL DEFAULT 'NONE',
    "leaderName" TEXT,
    "isVisitor" BOOLEAN NOT NULL DEFAULT false,
    "visitorNote" TEXT,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Member_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BibleStudyGroup" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "leaderName" TEXT,
    "schedule" TEXT,

    CONSTRAINT "BibleStudyGroup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BibleStudyMembership" (
    "id" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BibleStudyMembership_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VolunteerRecord" (
    "id" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "ministry" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,

    CONSTRAINT "VolunteerRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Event" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Event_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Attendance" (
    "id" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "present" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Attendance_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Member_category_idx" ON "Member"("category");

-- CreateIndex
CREATE INDEX "Member_lastName_firstName_idx" ON "Member"("lastName", "firstName");

-- CreateIndex
CREATE UNIQUE INDEX "BibleStudyGroup_name_key" ON "BibleStudyGroup"("name");

-- CreateIndex
CREATE UNIQUE INDEX "BibleStudyMembership_memberId_key" ON "BibleStudyMembership"("memberId");

-- CreateIndex
CREATE UNIQUE INDEX "VolunteerRecord_memberId_key" ON "VolunteerRecord"("memberId");

-- CreateIndex
CREATE UNIQUE INDEX "Attendance_memberId_eventId_key" ON "Attendance"("memberId", "eventId");

-- AddForeignKey
ALTER TABLE "BibleStudyMembership" ADD CONSTRAINT "BibleStudyMembership_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BibleStudyMembership" ADD CONSTRAINT "BibleStudyMembership_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "BibleStudyGroup"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VolunteerRecord" ADD CONSTRAINT "VolunteerRecord_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attendance" ADD CONSTRAINT "Attendance_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attendance" ADD CONSTRAINT "Attendance_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;
