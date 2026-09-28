import {
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createHmac, timingSafeEqual } from "node:crypto";

import { PrismaService } from "../database/prisma.service";

@Injectable()
export class CsrfService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async issueSessionToken(sessionToken: string): Promise<string> {
    const token = this.deriveToken(sessionToken);
    const updated = await this.prisma.session.updateMany({
      where: {
        tokenHash: this.sessionHash(sessionToken),
        revokedAt: null,
        idleExpiresAt: { gt: new Date() },
        absoluteExpiresAt: { gt: new Date() },
      },
      data: { csrfTokenHash: this.csrfHash(token) },
    });
    if (updated.count !== 1) throw this.authenticationRequired();
    return token;
  }

  async issueRecoveryToken(recoveryToken: string): Promise<string> {
    const token = this.deriveToken(recoveryToken);
    const updated = await this.prisma.recoverySession.updateMany({
      where: {
        tokenHash: this.sessionHash(recoveryToken),
        consumedAt: null,
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
      data: { csrfTokenHash: this.csrfHash(token) },
    });
    if (updated.count !== 1) throw this.recoveryRequired();
    return token;
  }

  async requireSessionToken(sessionToken: string, csrfToken: string) {
    const session = await this.prisma.session.findUnique({
      where: { tokenHash: this.sessionHash(sessionToken) },
      select: {
        csrfTokenHash: true,
        revokedAt: true,
        idleExpiresAt: true,
        absoluteExpiresAt: true,
      },
    });
    const now = new Date();
    if (
      !session ||
      session.revokedAt ||
      session.idleExpiresAt <= now ||
      session.absoluteExpiresAt <= now
    )
      throw this.authenticationRequired();
    this.requireMatchingToken(session.csrfTokenHash, csrfToken);
  }

  async requireRecoveryToken(recoveryToken: string, csrfToken: string) {
    const session = await this.prisma.recoverySession.findUnique({
      where: { tokenHash: this.sessionHash(recoveryToken) },
      select: {
        csrfTokenHash: true,
        consumedAt: true,
        revokedAt: true,
        expiresAt: true,
      },
    });
    if (
      !session ||
      session.consumedAt ||
      session.revokedAt ||
      session.expiresAt <= new Date()
    )
      throw this.recoveryRequired();
    this.requireMatchingToken(session.csrfTokenHash, csrfToken);
  }

  private requireMatchingToken(expectedHash: string | null, token: string) {
    if (!expectedHash || !token) throw this.invalidToken();
    const actualHash = this.csrfHash(token);
    const expected = Buffer.from(expectedHash);
    const actual = Buffer.from(actualHash);
    if (expected.length !== actual.length || !timingSafeEqual(expected, actual))
      throw this.invalidToken();
  }

  private sessionHash(value: string) {
    return createHmac(
      "sha256",
      this.config.getOrThrow<string>("SESSION_SECRET"),
    )
      .update(value)
      .digest("base64url");
  }

  private csrfHash(value: string) {
    return createHmac("sha256", this.config.getOrThrow<string>("CSRF_SECRET"))
      .update(value)
      .digest("base64url");
  }

  private deriveToken(sessionToken: string) {
    return createHmac("sha256", this.config.getOrThrow<string>("CSRF_SECRET"))
      .update(`csrf:${sessionToken}`)
      .digest("base64url");
  }

  private invalidToken() {
    return new ForbiddenException({
      error: {
        code: "CSRF_INVALID",
        message: "The security token is invalid.",
      },
    });
  }

  private authenticationRequired() {
    return new UnauthorizedException({
      error: {
        code: "SESSION_INVALID",
        message: "Authentication is required.",
      },
    });
  }

  private recoveryRequired() {
    return new ForbiddenException({
      error: {
        code: "RECOVERY_SESSION_INVALID",
        message: "Recovery verification is required.",
      },
    });
  }
}
