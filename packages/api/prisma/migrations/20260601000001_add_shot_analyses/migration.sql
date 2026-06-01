-- CreateTable
CREATE TABLE "ShotAnalysis" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shotId" TEXT NOT NULL,
    "analysisType" TEXT NOT NULL,
    "aiModel" TEXT NOT NULL,
    "barista" TEXT NOT NULL,
    "roaster" TEXT NOT NULL,
    "analyst" TEXT NOT NULL,
    "rawPrompt" TEXT,
    "tokenInputCount" INTEGER NOT NULL,
    "tokenOutputCount" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ShotAnalysis_shotId_fkey" FOREIGN KEY ("shotId") REFERENCES "Shot" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "ShotAnalysis_shotId_key" ON "ShotAnalysis"("shotId");

-- CreateIndex
CREATE INDEX "ShotAnalysis_shotId_idx" ON "ShotAnalysis"("shotId");
