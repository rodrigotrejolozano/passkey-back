import {
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";
import type { Request } from "express";

import { SessionCsrfGuard } from "../security/csrf.guard";
import { SessionService } from "./session.service";

@Controller("sessions")
@UseGuards(SessionCsrfGuard)
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

  @Delete(":id")
  async revoke(@Req() request: Request, @Param("id") id: string) {
    const current = await this.current(request);
    await this.sessions.revokeById(current.userId, id);
    return { data: { revoked: true } };
  }

  private async current(request: Request) {
    const token = request.cookies?.[this.sessions.cookieName] as
      string | undefined;
    return this.sessions.getActive(token ?? "");
  }
}
