-- CreateEnum
CREATE TYPE "BibleStudyRole" AS ENUM ('FACILITATOR', 'CO_FACILITATOR');

-- AlterTable
ALTER TABLE "Attendance" ADD COLUMN     "role" "BibleStudyRole";

-- AlterTable
ALTER TABLE "Event" ADD COLUMN     "preacherName" TEXT,
ADD COLUMN     "topic" TEXT;
