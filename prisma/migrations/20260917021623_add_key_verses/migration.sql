-- AlterTable
ALTER TABLE "Event" ADD COLUMN     "keyVerses" TEXT[] DEFAULT ARRAY[]::TEXT[];
