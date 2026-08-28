-- AlterTable
ALTER TABLE "Invoice" ADD COLUMN "scopeGaps" JSONB;
ALTER TABLE "Invoice" ADD COLUMN "ambiguities" JSONB;
