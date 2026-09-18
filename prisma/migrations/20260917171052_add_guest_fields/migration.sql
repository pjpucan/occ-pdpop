-- CreateEnum
CREATE TYPE "GuestType" AS ENUM ('MEMBER', 'BIBLE_STUDY');

-- AlterTable
ALTER TABLE "Member" ADD COLUMN     "guestType" "GuestType",
ADD COLUMN     "invitedByName" TEXT,
ADD COLUMN     "isFirstTimer" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "isWalkIn" BOOLEAN NOT NULL DEFAULT false;
