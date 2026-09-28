-- OAuth transactions are short-lived and cannot be safely upgraded without
-- the browser-only binding value.
DELETE FROM "OAuthTransaction";

-- AlterTable
ALTER TABLE "OAuthTransaction" ADD COLUMN "browserBindingHash" TEXT NOT NULL;
