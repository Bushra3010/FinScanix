-- AlterTable
ALTER TABLE "Invoice" ADD COLUMN     "extractionNote" TEXT,
ADD COLUMN     "language" TEXT;

-- AlterTable
ALTER TABLE "LineItem" ADD COLUMN     "printedAmount" DOUBLE PRECISION;
