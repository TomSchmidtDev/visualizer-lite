-- CreateTable
CREATE TABLE "Shot" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "startTime" DATETIME NOT NULL,
    "filePath" TEXT NOT NULL,
    "sha256" TEXT NOT NULL,
    "duration" REAL,
    "beanWeight" REAL,
    "drinkWeight" REAL,
    "drinkTds" REAL,
    "drinkEy" REAL,
    "profileTitle" TEXT,
    "grinderModel" TEXT,
    "grinderSetting" TEXT,
    "barista" TEXT,
    "beanBrand" TEXT,
    "beanType" TEXT,
    "roastDate" DATETIME,
    "roastLevel" TEXT,
    "espressoEnjoyment" INTEGER,
    "fragrance" REAL,
    "aroma" REAL,
    "flavor" REAL,
    "aftertaste" REAL,
    "acidity" REAL,
    "bitterness" REAL,
    "sweetness" REAL,
    "mouthfeel" REAL,
    "beanNotes" TEXT,
    "espressoNotes" TEXT,
    "privateNotes" TEXT,
    "shotData" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "Tag" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "Settings" (
    "key" TEXT NOT NULL PRIMARY KEY,
    "value" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "_ShotToTag" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,
    CONSTRAINT "_ShotToTag_A_fkey" FOREIGN KEY ("A") REFERENCES "Shot" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "_ShotToTag_B_fkey" FOREIGN KEY ("B") REFERENCES "Tag" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "Shot_sha256_key" ON "Shot"("sha256");

-- CreateIndex
CREATE INDEX "Shot_startTime_idx" ON "Shot"("startTime");

-- CreateIndex
CREATE INDEX "Shot_beanBrand_idx" ON "Shot"("beanBrand");

-- CreateIndex
CREATE INDEX "Shot_beanType_idx" ON "Shot"("beanType");

-- CreateIndex
CREATE INDEX "Shot_profileTitle_idx" ON "Shot"("profileTitle");

-- CreateIndex
CREATE INDEX "Shot_grinderModel_idx" ON "Shot"("grinderModel");

-- CreateIndex
CREATE UNIQUE INDEX "Tag_name_key" ON "Tag"("name");

-- CreateIndex
CREATE UNIQUE INDEX "_ShotToTag_AB_unique" ON "_ShotToTag"("A", "B");

-- CreateIndex
CREATE INDEX "_ShotToTag_B_index" ON "_ShotToTag"("B");

-- FTS5 full-text search virtual table
CREATE VIRTUAL TABLE IF NOT EXISTS shots_fts USING fts5(
  id UNINDEXED,
  beanBrand,
  beanType,
  profileTitle,
  grinderModel,
  espressoNotes,
  beanNotes,
  content='Shot',
  content_rowid='id'
);

CREATE TRIGGER IF NOT EXISTS shots_fts_ai AFTER INSERT ON Shot BEGIN
  INSERT INTO shots_fts(rowid, id, beanBrand, beanType, profileTitle, grinderModel, espressoNotes, beanNotes)
  VALUES (new.rowid, new.id, new.beanBrand, new.beanType, new.profileTitle, new.grinderModel, new.espressoNotes, new.beanNotes);
END;

CREATE TRIGGER IF NOT EXISTS shots_fts_ad AFTER DELETE ON Shot BEGIN
  INSERT INTO shots_fts(shots_fts, rowid, id, beanBrand, beanType, profileTitle, grinderModel, espressoNotes, beanNotes)
  VALUES ('delete', old.rowid, old.id, old.beanBrand, old.beanType, old.profileTitle, old.grinderModel, old.espressoNotes, old.beanNotes);
END;

CREATE TRIGGER IF NOT EXISTS shots_fts_au AFTER UPDATE ON Shot BEGIN
  INSERT INTO shots_fts(shots_fts, rowid, id, beanBrand, beanType, profileTitle, grinderModel, espressoNotes, beanNotes)
  VALUES ('delete', old.rowid, old.id, old.beanBrand, old.beanType, old.profileTitle, old.grinderModel, old.espressoNotes, old.beanNotes);
  INSERT INTO shots_fts(rowid, id, beanBrand, beanType, profileTitle, grinderModel, espressoNotes, beanNotes)
  VALUES (new.rowid, new.id, new.beanBrand, new.beanType, new.profileTitle, new.grinderModel, new.espressoNotes, new.beanNotes);
END;
