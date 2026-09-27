import { Controller, Get, Post, Req } from "@nestjs/common";
import type { Request } from "express";

import { SessionService } from "./session.service";

@Controller("sessions")
export class SessionsController {
  constructor(private readonly sessions: SessionService) {}

  @Get()
  async list(@Req() request: Request) {
    const current = await this.current(request);
    return {
      data: {
        sessions: await this.sessions.list(current.userId),
        currentSessionId: current.id,
      },
    };
  }

  @Post("revoke-others")
  async revokeOthers(@Req() request: Request) {
    const current = await this.current(request);
    await this.sessions.revokeOthers(current.userId, current.id);
    return { data: { revoked: true } };
  }

  private async current(request: Request) {
    const token = request.cookies?.[this.sessions.cookieName] as
      string | undefined;
    return this.sessions.getActive(token ?? "");
  }
}
