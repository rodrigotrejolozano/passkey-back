import { Injectable, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createHmac } from "node:crypto";

import { RandomSource } from "../common/random-source";
import { PrismaService } from "../database/prisma.service";
import { SessionAuthMethod } from "../generated/prisma/client";

const sessionCookieName = "passkey_session";

@Injectable()
export class SessionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly random: RandomSource,
    private readonly config: ConfigService,
  ) {}

  get cookieName(): string {
    return sessionCookieName;
  }

  async create(userId: string, authMethod: SessionAuthMethod): Promise<string> {
    const token = this.random.token();
    const now = new Date();
    const idleHours = Number(
      this.config.get("SESSION_IDLE_TIMEOUT_HOURS") ?? 24,
    );
    const absoluteDays = Number(
      this.config.get("SESSION_ABSOLUTE_TIMEOUT_DAYS") ?? 30,
    );

    await this.prisma.session.create({
      data: {
        userId,
        tokenHash: this.hash(token),
        authMethod,
        lastSeenAt: now,
        idleExpiresAt: new Date(now.getTime() + idleHours * 60 * 60 * 1000),
        absoluteExpiresAt: new Date(
          now.getTime() + absoluteDays * 24 * 60 * 60 * 1000,
        ),
      },
    });

    return token;
  }

  async getActive(token: string) {
    const now = new Date();
    const session = await this.prisma.session.findUnique({
      where: { tokenHash: this.hash(token) },
      include: { user: true },
    });

    if (
      !session ||
      session.revokedAt ||
      session.idleExpiresAt <= now ||
      session.absoluteExpiresAt <= now
    ) {
      throw new UnauthorizedException({
        error: {
          code: "SESSION_INVALID",
          message: "Authentication is required.",
        },
      });
    }

    const idleHours = Number(
      this.config.get("SESSION_IDLE_TIMEOUT_HOURS") ?? 24,
    );
    const nextIdle = new Date(
      Math.min(
        now.getTime() + idleHours * 60 * 60 * 1000,
        session.absoluteExpiresAt.getTime(),
      ),
    );
    await this.prisma.session.update({
      where: { id: session.id },
      data: { lastSeenAt: now, idleExpiresAt: nextIdle },
    });
    return session;
  }

  async revoke(token: string): Promise<void> {
    await this.prisma.session.updateMany({
      where: { tokenHash: this.hash(token), revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  private hash(value: string): string {
    const secret = this.config.getOrThrow<string>("SESSION_SECRET");
    return createHmac("sha256", secret).update(value).digest("base64url");
  }
}
