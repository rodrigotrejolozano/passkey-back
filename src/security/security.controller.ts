import { Controller, Get, Req } from "@nestjs/common";
import type { Request } from "express";

import { PrismaService } from "../database/prisma.service";
import { SessionService } from "../sessions/session.service";

@Controller("security")
export class SecurityController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sessions: SessionService,
  ) {}

  @Get("passkeys")
  async passkeys(@Req() request: Request) {
    const session = await this.currentSession(request);
    const passkeys = await this.prisma.passkeyCredential.findMany({
      where: { userId: session.userId },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        name: true,
        createdAt: true,
        lastUsedAt: true,
        deviceType: true,
        backedUp: true,
      },
    });
    return { data: { passkeys } };
  }

  @Get("google")
  async google(@Req() request: Request) {
    const session = await this.currentSession(request);
    const identity = await this.prisma.externalIdentity.findFirst({
      where: { userId: session.userId, provider: "GOOGLE" },
      select: { providerEmail: true, createdAt: true },
    });
    return { data: { identity } };
  }

  private async currentSession(request: Request) {
    const token = request.cookies?.[this.sessions.cookieName] as
      string | undefined;
    return this.sessions.getActive(token ?? "");
  }
}
