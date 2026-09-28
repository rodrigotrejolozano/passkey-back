-- AlterTable
ALTER TABLE "RecoveryCode" ADD COLUMN "lookupKey" TEXT;

UPDATE "RecoveryCode"
SET "lookupKey" = "id",
    "invalidatedAt" = COALESCE("invalidatedAt", CURRENT_TIMESTAMP);

ALTER TABLE "RecoveryCode" ALTER COLUMN "lookupKey" SET NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "RecoveryCode_lookupKey_key" ON "RecoveryCode"("lookupKey");
