import { BadRequestException, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createHmac, randomInt } from "node:crypto";

import { RandomSource } from "../common/random-source";
import { PrismaService } from "../database/prisma.service";
import { EmailProvider } from "../email/email.provider";
import {
  EmailChallengePurpose,
  EmailDeliveryMethod,
} from "../generated/prisma/client";

@Injectable()
export class RecoveryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly email: EmailProvider,
    private readonly random: RandomSource,
    private readonly config: ConfigService,
  ) {}

  async requestRecoveryEmailVerification(userId: string, email: string) {
    const normalizedEmail = email.trim().toLowerCase();
    const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
    const challenge = await this.prisma.emailChallenge.create({
      data: {
        userId,
        targetEmail: email.trim(),
        normalizedTargetEmail: normalizedEmail,
        purpose: EmailChallengePurpose.RECOVERY_EMAIL_VERIFICATION,
        deliveryMethod: EmailDeliveryMethod.OTP,
        secretHash: this.hash(code),
        expiresAt: new Date(Date.now() + 300_000),
      },
    });
    await this.email.send({
      to: email.trim(),
      subject: "Verify your recovery email",
      text: `Your verification code is ${code}. It expires in 5 minutes.`,
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
    if (!challenge || this.hash(code) !== challenge.secretHash)
      throw this.invalidCode();
    const consumed = await this.prisma.emailChallenge.updateMany({
      where: { id: challenge.id, consumedAt: null },
      data: { consumedAt: new Date() },
    });
    if (consumed.count !== 1) throw this.invalidCode();
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

  async removeRecoveryEmail(userId: string) {
    await this.prisma.recoveryEmail.deleteMany({ where: { userId } });
  }

  async getRecoveryEmail(userId: string) {
    return this.prisma.recoveryEmail.findUnique({
      where: { userId },
      select: { email: true, verifiedAt: true },
    });
  }

  async requestPublicRecovery(email: string): Promise<void> {
    const recoveryEmail = await this.prisma.recoveryEmail.findUnique({
      where: { normalizedEmail: email.trim().toLowerCase() },
    });
    if (!recoveryEmail) return;
    const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
    await this.prisma.emailChallenge.create({
      data: {
        userId: recoveryEmail.userId,
        targetEmail: recoveryEmail.email,
        normalizedTargetEmail: recoveryEmail.normalizedEmail,
        purpose: EmailChallengePurpose.ACCOUNT_RECOVERY,
        deliveryMethod: EmailDeliveryMethod.OTP,
        secretHash: this.hash(code),
        expiresAt: new Date(Date.now() + 300_000),
      },
    });
    await this.email.send({
      to: recoveryEmail.email,
      subject: "Recover your account",
      text: `Your recovery code is ${code}. It expires in 5 minutes.`,
    });
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
    if (!challenge?.userId || this.hash(code) !== challenge.secretHash)
      throw this.invalidCode();
    const consumed = await this.prisma.emailChallenge.updateMany({
      where: { id: challenge.id, consumedAt: null },
      data: { consumedAt: new Date() },
    });
    if (consumed.count !== 1) throw this.invalidCode();
    const token = this.random.token();
    const timeoutMinutes = Number(
      this.config.get("RECOVERY_SESSION_TIMEOUT_MINUTES") ?? 15,
    );
    await this.prisma.recoverySession.create({
      data: {
        userId: challenge.userId,
        tokenHash: this.hash(token),
        expiresAt: new Date(Date.now() + timeoutMinutes * 60_000),
      },
    });
    return token;
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
}
