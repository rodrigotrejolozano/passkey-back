import {
  BadRequestException,
  ConflictException,
  Injectable,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
} from "@simplewebauthn/server";
import { createHmac, randomBytes, randomInt } from "node:crypto";

import { ChallengeStore } from "../challenges/challenge.store";
import { RandomSource } from "../common/random-source";
import { PrismaService } from "../database/prisma.service";
import { EmailProvider } from "../email/email.provider";
import {
  EmailChallengePurpose,
  EmailDeliveryMethod,
  SessionAuthMethod,
  WebAuthnChallengeType,
} from "../generated/prisma/client";
import { SessionService } from "../sessions/session.service";

@Injectable()
export class RecoveryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly challenges: ChallengeStore,
    private readonly email: EmailProvider,
    private readonly random: RandomSource,
    private readonly sessions: SessionService,
    private readonly config: ConfigService,
  ) {}

  async requestRecoveryEmailVerification(
    userId: string,
    email: string,
    deliveryMethod: EmailDeliveryMethod = EmailDeliveryMethod.OTP,
  ) {
    const normalizedEmail = email.trim().toLowerCase();
    const secret =
      deliveryMethod === EmailDeliveryMethod.OTP
        ? String(randomInt(0, 1_000_000)).padStart(6, "0")
        : this.random.token();
    const challenge = await this.prisma.emailChallenge.create({
      data: {
        userId,
        targetEmail: email.trim(),
        normalizedTargetEmail: normalizedEmail,
        purpose: EmailChallengePurpose.RECOVERY_EMAIL_VERIFICATION,
        deliveryMethod,
        secretHash: this.hash(secret),
        expiresAt: new Date(Date.now() + 300_000),
      },
    });
    const text =
      deliveryMethod === EmailDeliveryMethod.OTP
        ? `Your verification code is ${secret}. It expires in 5 minutes.`
        : `Use this secure link to verify your recovery email:\n\n${this.magicLink("/api/security/recovery-email/verification/link", challenge.id, secret)}\n\nThis link expires in 5 minutes and can only be used once.`;
    await this.email.send({
      to: email.trim(),
      subject: "Verify your recovery email",
      text,
    });
    return { challengeId: challenge.id };
  }

  async verifyRecoveryEmail(userId: string, challengeId: string, code: string) {
    const challenge = await this.prisma.emailChallenge.findFirst({
      where: {
        id: challengeId,
        userId,
        purpose: EmailChallengePurpose.RECOVERY_EMAIL_VERIFICATION,
        deliveryMethod: EmailDeliveryMethod.OTP,
        consumedAt: null,
        expiresAt: { gt: new Date() },
      },
    });
    if (!challenge) throw this.invalidCode();
    const existing = await this.prisma.recoveryEmail.findUnique({
      where: { normalizedEmail: challenge.normalizedTargetEmail },
      select: { userId: true },
    });
    if (existing && existing.userId !== userId) {
      throw new ConflictException({
        error: {
          code: "RECOVERY_EMAIL_TAKEN",
          message: "This recovery email is already used by another account.",
        },
      });
    }
    const consumed = await this.prisma.emailChallenge.updateMany({
      where: {
        id: challenge.id,
        consumedAt: null,
        expiresAt: { gt: new Date() },
      },
      data: { consumedAt: new Date() },
    });
    if (consumed.count !== 1) throw this.invalidCode();
    if (this.hash(code) !== challenge.secretHash) throw this.invalidCode();
    await this.prisma.recoveryEmail.upsert({
      where: { userId },
      create: {
        userId,
        email: challenge.targetEmail,
        normalizedEmail: challenge.normalizedTargetEmail,
        verifiedAt: new Date(),
      },
      update: {
        email: challenge.targetEmail,
        normalizedEmail: challenge.normalizedTargetEmail,
        verifiedAt: new Date(),
      },
    });
  }

  async verifyRecoveryEmailMagicLink(challengeId: string, token: string) {
    const challenge = await this.prisma.emailChallenge.findFirst({
      where: {
        id: challengeId,
        purpose: EmailChallengePurpose.RECOVERY_EMAIL_VERIFICATION,
        deliveryMethod: EmailDeliveryMethod.MAGIC_LINK,
        consumedAt: null,
        expiresAt: { gt: new Date() },
      },
    });
    if (!challenge?.userId) throw this.invalidCode();
    const existing = await this.prisma.recoveryEmail.findUnique({
      where: { normalizedEmail: challenge.normalizedTargetEmail },
      select: { userId: true },
    });
    if (existing && existing.userId !== challenge.userId)
      throw this.invalidCode();
    await this.prisma.$transaction(async (transaction) => {
      const consumed = await transaction.emailChallenge.updateMany({
        where: {
          id: challenge.id,
          consumedAt: null,
          expiresAt: { gt: new Date() },
        },
        data: { consumedAt: new Date() },
      });
      if (consumed.count !== 1) throw this.invalidCode();
      if (this.hash(token) !== challenge.secretHash) return;
      await transaction.recoveryEmail.upsert({
        where: { userId: challenge.userId! },
        create: {
          userId: challenge.userId!,
          email: challenge.targetEmail,
          normalizedEmail: challenge.normalizedTargetEmail,
          verifiedAt: new Date(),
        },
        update: {
          email: challenge.targetEmail,
          normalizedEmail: challenge.normalizedTargetEmail,
          verifiedAt: new Date(),
        },
      });
    });
    if (this.hash(token) !== challenge.secretHash) throw this.invalidCode();
  }

  async removeRecoveryEmail(userId: string) {
    await this.prisma.recoveryEmail.deleteMany({ where: { userId } });
  }

  async getRecoveryEmail(userId: string) {
    return this.prisma.recoveryEmail.findUnique({
      where: { userId },
      select: { email: true, verifiedAt: true },
    });
  }

  async requestPublicRecovery(
    email: string,
    deliveryMethod: EmailDeliveryMethod = EmailDeliveryMethod.OTP,
  ): Promise<void> {
    const recoveryEmail = await this.prisma.recoveryEmail.findUnique({
      where: { normalizedEmail: email.trim().toLowerCase() },
    });
    if (!recoveryEmail) return;
    const secret =
      deliveryMethod === EmailDeliveryMethod.OTP
        ? String(randomInt(0, 1_000_000)).padStart(6, "0")
        : this.random.token();
    const challenge = await this.prisma.emailChallenge.create({
      data: {
        userId: recoveryEmail.userId,
        targetEmail: recoveryEmail.email,
        normalizedTargetEmail: recoveryEmail.normalizedEmail,
        purpose: EmailChallengePurpose.ACCOUNT_RECOVERY,
        deliveryMethod,
        secretHash: this.hash(secret),
        expiresAt: new Date(Date.now() + 300_000),
      },
    });
    const text =
      deliveryMethod === EmailDeliveryMethod.OTP
        ? `Your recovery code is ${secret}. It expires in 5 minutes.`
        : `Use this secure link to continue account recovery:\n\n${this.magicLink("/api/recovery/email/verify-link", challenge.id, secret)}\n\nThis link expires in 5 minutes and can only be used once. It does not sign you in.`;
    await this.email
      .send({
        to: recoveryEmail.email,
        subject: "Recover your account",
        text,
      })
      .catch(() => undefined);
  }

  async verifyPublicRecovery(email: string, code: string): Promise<string> {
    const challenge = await this.prisma.emailChallenge.findFirst({
      where: {
        normalizedTargetEmail: email.trim().toLowerCase(),
        purpose: EmailChallengePurpose.ACCOUNT_RECOVERY,
        deliveryMethod: EmailDeliveryMethod.OTP,
        consumedAt: null,
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: "desc" },
    });
    if (!challenge?.userId) throw this.invalidCode();
    const consumed = await this.prisma.emailChallenge.updateMany({
      where: {
        id: challenge.id,
        consumedAt: null,
        expiresAt: { gt: new Date() },
      },
      data: { consumedAt: new Date() },
    });
    if (consumed.count !== 1) throw this.invalidCode();
    if (this.hash(code) !== challenge.secretHash) throw this.invalidCode();
    return this.createRecoverySession(challenge.userId);
  }

  async verifyPublicRecoveryMagicLink(
    challengeId: string,
    token: string,
  ): Promise<string> {
    const challenge = await this.prisma.emailChallenge.findFirst({
      where: {
        id: challengeId,
        purpose: EmailChallengePurpose.ACCOUNT_RECOVERY,
        deliveryMethod: EmailDeliveryMethod.MAGIC_LINK,
        consumedAt: null,
        expiresAt: { gt: new Date() },
      },
    });
    if (!challenge?.userId) throw this.invalidCode();
    const consumed = await this.prisma.emailChallenge.updateMany({
      where: {
        id: challenge.id,
        consumedAt: null,
        expiresAt: { gt: new Date() },
      },
      data: { consumedAt: new Date() },
    });
    if (consumed.count !== 1) throw this.invalidCode();
    if (this.hash(token) !== challenge.secretHash) throw this.invalidCode();
    return this.createRecoverySession(challenge.userId);
  }

  async getActiveRecoverySession(token: string) {
    const session = await this.prisma.recoverySession.findUnique({
      where: { tokenHash: this.hash(token) },
    });
    if (
      !session ||
      session.consumedAt ||
      session.revokedAt ||
      session.expiresAt <= new Date()
    )
      throw new BadRequestException({
        error: {
          code: "RECOVERY_SESSION_INVALID",
          message: "Recovery verification is required.",
        },
      });
    return session;
  }

  async generateRecoveryCodes(userId: string): Promise<string[]> {
    const batchId = this.random.token();
    const codes = Array.from({ length: 10 }, () => this.recoveryCode());
    await this.prisma.$transaction(async (transaction) => {
      await transaction.recoveryCode.updateMany({
        where: { userId, usedAt: null, invalidatedAt: null },
        data: { invalidatedAt: new Date() },
      });
      await transaction.recoveryCode.createMany({
        data: codes.map((code) => ({
          userId,
          batchId,
          codeHash: this.hash(code),
        })),
      });
    });
    return codes;
  }

  async verifyRecoveryCode(code: string): Promise<string> {
    const recoveryCode = await this.prisma.recoveryCode.findFirst({
      where: {
        codeHash: this.hash(code.replace(/\s/g, "").toUpperCase()),
        usedAt: null,
        invalidatedAt: null,
      },
    });
    if (!recoveryCode) throw this.invalidCode();
    const used = await this.prisma.recoveryCode.updateMany({
      where: { id: recoveryCode.id, usedAt: null, invalidatedAt: null },
      data: { usedAt: new Date() },
    });
    if (used.count !== 1) throw this.invalidCode();
    return this.createRecoverySession(recoveryCode.userId);
  }

  async restorePasskeyOptions(recoveryToken: string) {
    const recoverySession = await this.getActiveRecoverySession(recoveryToken);
    const options = await generateRegistrationOptions({
      rpID: this.rpId,
      rpName: this.rpName,
      userID: randomBytes(32),
      userName: recoverySession.userId,
      userDisplayName: "Recovered user",
      authenticatorSelection: {
        residentKey: "required",
        userVerification: "required",
      },
    });
    const challenge = await this.challenges.create({
      challenge: options.challenge,
      type: WebAuthnChallengeType.REGISTRATION,
      userId: recoverySession.userId,
      recoverySessionId: recoverySession.id,
      expiresAt: new Date(Date.now() + 300_000),
    });
    return { challengeId: challenge.id, options };
  }

  async verifyRestoredPasskey(
    recoveryToken: string,
    challengeId: string,
    response: unknown,
  ): Promise<string> {
    const recoverySession = await this.getActiveRecoverySession(recoveryToken);
    const challenge = await this.challenges.consume(challengeId, new Date());
    if (
      !challenge ||
      challenge.type !== WebAuthnChallengeType.REGISTRATION ||
      challenge.userId !== recoverySession.userId ||
      challenge.recoverySessionId !== recoverySession.id
    )
      throw this.invalidCode();
    const verification = await verifyRegistrationResponse({
      response: response as never,
      expectedChallenge: challenge.challenge,
      expectedOrigin: this.origin,
      expectedRPID: this.rpId,
      requireUserVerification: true,
    });
    if (!verification.verified || !verification.registrationInfo)
      throw this.invalidCode();
    const { credential, credentialDeviceType, credentialBackedUp } =
      verification.registrationInfo;
    return this.prisma.$transaction(async (transaction) => {
      const consumed = await transaction.recoverySession.updateMany({
        where: {
          id: recoverySession.id,
          consumedAt: null,
          revokedAt: null,
          expiresAt: { gt: new Date() },
        },
        data: { consumedAt: new Date() },
      });
      if (consumed.count !== 1) throw this.invalidCode();
      await transaction.passkeyCredential.create({
        data: {
          userId: recoverySession.userId,
          credentialId: credential.id,
          publicKey: credential.publicKey,
          counter: BigInt(credential.counter),
          transports: credential.transports ?? [],
          deviceType: credentialDeviceType,
          backedUp: credentialBackedUp,
          name: "Recovered passkey",
        },
      });
      return this.sessions.create(
        recoverySession.userId,
        SessionAuthMethod.RECOVERY_RESTORED,
        transaction,
      );
    });
  }

  private hash(value: string) {
    return createHmac(
      "sha256",
      this.config.getOrThrow<string>("SESSION_SECRET"),
    )
      .update(value)
      .digest("base64url");
  }

  private invalidCode() {
    return new BadRequestException({
      error: {
        code: "RECOVERY_CODE_INVALID",
        message: "This verification code is invalid or expired.",
      },
    });
  }

  private recoveryCode() {
    return randomBytes(8).toString("hex").toUpperCase();
  }

  private async createRecoverySession(userId: string): Promise<string> {
    const token = this.random.token();
    const timeoutMinutes = Number(
      this.config.get("RECOVERY_SESSION_TIMEOUT_MINUTES") ?? 5,
    );
    await this.prisma.recoverySession.create({
      data: {
        userId,
        tokenHash: this.hash(token),
        expiresAt: new Date(Date.now() + timeoutMinutes * 60_000),
      },
    });
    return token;
  }

  private magicLink(path: string, challengeId: string, token: string): string {
    const url = new URL(
      path,
      this.config.get<string>("BACKEND_ORIGIN") ?? "http://localhost:3001",
    );
    url.searchParams.set("challengeId", challengeId);
    url.searchParams.set("token", token);
    return url.toString();
  }

  private get rpId() {
    return this.config.getOrThrow<string>("WEBAUTHN_RP_ID");
  }
  private get rpName() {
    return this.config.getOrThrow<string>("WEBAUTHN_RP_NAME");
  }
  private get origin() {
    return this.config.getOrThrow<string>("WEBAUTHN_ORIGIN");
  }
}
