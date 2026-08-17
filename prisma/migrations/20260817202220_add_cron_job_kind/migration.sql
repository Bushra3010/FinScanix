-- AlterTable
ALTER TABLE "CronJob" ADD COLUMN     "kind" TEXT NOT NULL DEFAULT 'price_refresh';
