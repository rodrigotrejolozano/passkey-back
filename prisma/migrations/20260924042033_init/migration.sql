-- CreateEnum
CREATE TYPE "IdentityProvider" AS ENUM ('GOOGLE');

-- CreateEnum
CREATE TYPE "SessionAuthMethod" AS ENUM ('PASSKEY', 'GOOGLE', 'RECOVERY_RESTORED');

-- CreateEnum
CREATE TYPE "WebAuthnChallengeType" AS ENUM ('REGISTRATION', 'AUTHENTICATION');

-- CreateEnum
CREATE TYPE "EmailChallengePurpose" AS ENUM ('RECOVERY_EMAIL_VERIFICATION', 'ACCOUNT_RECOVERY');

-- CreateEnum
CREATE TYPE "EmailDeliveryMethod" AS ENUM ('OTP', 'MAGIC_LINK');

-- CreateEnum
CREATE TYPE "OAuthTransactionPurpose" AS ENUM ('LOGIN_OR_SIGNUP', 'LINK', 'STEP_UP', 'RECOVERY_RESTORE');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PasskeyCredential" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "credentialId" TEXT NOT NULL,
    "publicKey" BYTEA NOT NULL,
    "counter" BIGINT NOT NULL,
    "transports" TEXT[],
    "deviceType" TEXT,
    "backedUp" BOOLEAN,
    "name" TEXT NOT NULL,
    "lastUsedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PasskeyCredential_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExternalIdentity" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "provider" "IdentityProvider" NOT NULL,
    "providerSubjectId" TEXT NOT NULL,
    "providerEmail" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExternalIdentity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecoveryEmail" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "normalizedEmail" TEXT NOT NULL,
    "verifiedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RecoveryEmail_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecoveryCode" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "usedAt" TIMESTAMP(3),
    "invalidatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RecoveryCode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmailChallenge" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "targetEmail" TEXT NOT NULL,
    "normalizedTargetEmail" TEXT NOT NULL,
    "purpose" "EmailChallengePurpose" NOT NULL,
    "deliveryMethod" "EmailDeliveryMethod" NOT NULL,
    "secretHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmailChallenge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "csrfTokenHash" TEXT,
    "authMethod" "SessionAuthMethod" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL,
    "idleExpiresAt" TIMESTAMP(3) NOT NULL,
    "absoluteExpiresAt" TIMESTAMP(3) NOT NULL,
    "stepUpExpiresAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "userAgent" TEXT,
    "ipAddress" TEXT,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecoverySession" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RecoverySession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WebAuthnChallenge" (
    "id" TEXT NOT NULL,
    "challenge" TEXT NOT NULL,
    "type" "WebAuthnChallengeType" NOT NULL,
    "userId" TEXT,
    "sessionId" TEXT,
    "recoverySessionId" TEXT,
    "pendingUserHandle" BYTEA,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WebAuthnChallenge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OAuthTransaction" (
    "id" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "nonce" TEXT NOT NULL,
    "purpose" "OAuthTransactionPurpose" NOT NULL,
    "userId" TEXT,
    "sessionId" TEXT,
    "recoverySessionId" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OAuthTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RateLimitAttempt" (
    "id" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RateLimitAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PasskeyCredential_credentialId_key" ON "PasskeyCredential"("credentialId");

-- CreateIndex
CREATE INDEX "PasskeyCredential_userId_idx" ON "PasskeyCredential"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "ExternalIdentity_provider_providerSubjectId_key" ON "ExternalIdentity"("provider", "providerSubjectId");

-- CreateIndex
CREATE UNIQUE INDEX "ExternalIdentity_userId_provider_key" ON "ExternalIdentity"("userId", "provider");

-- CreateIndex
CREATE UNIQUE INDEX "RecoveryEmail_userId_key" ON "RecoveryEmail"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "RecoveryEmail_normalizedEmail_key" ON "RecoveryEmail"("normalizedEmail");

-- CreateIndex
CREATE INDEX "RecoveryCode_userId_batchId_idx" ON "RecoveryCode"("userId", "batchId");

-- CreateIndex
CREATE INDEX "EmailChallenge_normalizedTargetEmail_purpose_idx" ON "EmailChallenge"("normalizedTargetEmail", "purpose");

-- CreateIndex
CREATE INDEX "EmailChallenge_expiresAt_idx" ON "EmailChallenge"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "Session_tokenHash_key" ON "Session"("tokenHash");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

-- CreateIndex
CREATE INDEX "Session_absoluteExpiresAt_idx" ON "Session"("absoluteExpiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "RecoverySession_tokenHash_key" ON "RecoverySession"("tokenHash");

-- CreateIndex
CREATE INDEX "RecoverySession_userId_idx" ON "RecoverySession"("userId");

-- CreateIndex
CREATE INDEX "RecoverySession_expiresAt_idx" ON "RecoverySession"("expiresAt");

-- CreateIndex
CREATE INDEX "WebAuthnChallenge_expiresAt_idx" ON "WebAuthnChallenge"("expiresAt");

-- CreateIndex
CREATE INDEX "WebAuthnChallenge_userId_idx" ON "WebAuthnChallenge"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "OAuthTransaction_state_key" ON "OAuthTransaction"("state");

-- CreateIndex
CREATE UNIQUE INDEX "OAuthTransaction_nonce_key" ON "OAuthTransaction"("nonce");

-- CreateIndex
CREATE INDEX "OAuthTransaction_expiresAt_idx" ON "OAuthTransaction"("expiresAt");

-- CreateIndex
CREATE INDEX "RateLimitAttempt_scope_key_createdAt_idx" ON "RateLimitAttempt"("scope", "key", "createdAt");

-- CreateIndex
CREATE INDEX "RateLimitAttempt_createdAt_idx" ON "RateLimitAttempt"("createdAt");

-- AddForeignKey
ALTER TABLE "PasskeyCredential" ADD CONSTRAINT "PasskeyCredential_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExternalIdentity" ADD CONSTRAINT "ExternalIdentity_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecoveryEmail" ADD CONSTRAINT "RecoveryEmail_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecoveryCode" ADD CONSTRAINT "RecoveryCode_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailChallenge" ADD CONSTRAINT "EmailChallenge_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecoverySession" ADD CONSTRAINT "RecoverySession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WebAuthnChallenge" ADD CONSTRAINT "WebAuthnChallenge_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WebAuthnChallenge" ADD CONSTRAINT "WebAuthnChallenge_recoverySessionId_fkey" FOREIGN KEY ("recoverySessionId") REFERENCES "RecoverySession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OAuthTransaction" ADD CONSTRAINT "OAuthTransaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OAuthTransaction" ADD CONSTRAINT "OAuthTransaction_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OAuthTransaction" ADD CONSTRAINT "OAuthTransaction_recoverySessionId_fkey" FOREIGN KEY ("recoverySessionId") REFERENCES "RecoverySession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
