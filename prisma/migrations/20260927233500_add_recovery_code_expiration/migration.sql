-- AlterTable
ALTER TABLE "RecoveryCode" ADD COLUMN "expiresAt" TIMESTAMP(3);

UPDATE "RecoveryCode"
SET "expiresAt" = "createdAt" + INTERVAL '5 minutes';

ALTER TABLE "RecoveryCode" ALTER COLUMN "expiresAt" SET NOT NULL;

-- CreateIndex
CREATE INDEX "RecoveryCode_expiresAt_idx" ON "RecoveryCode"("expiresAt");
