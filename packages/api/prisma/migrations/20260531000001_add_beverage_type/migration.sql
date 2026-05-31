-- AlterTable
ALTER TABLE "Shot" ADD COLUMN "beverageType" TEXT;

-- CreateIndex
CREATE INDEX "Shot_beverageType_idx" ON "Shot"("beverageType");
