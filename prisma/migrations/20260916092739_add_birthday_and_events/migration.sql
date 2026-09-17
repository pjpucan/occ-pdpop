-- CreateEnum
CREATE TYPE "EventType" AS ENUM ('SERVICE', 'BIBLE_STUDY');

-- CreateEnum
CREATE TYPE "Session" AS ENUM ('MORNING', 'AFTERNOON');

-- AlterTable
ALTER TABLE "Event" ADD COLUMN     "session" "Session",
ADD COLUMN     "type" "EventType" NOT NULL DEFAULT 'SERVICE';

-- AlterTable
ALTER TABLE "Member" ADD COLUMN     "birthday" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "Event_date_idx" ON "Event"("date");

-- CreateIndex
CREATE INDEX "Event_type_idx" ON "Event"("type");
