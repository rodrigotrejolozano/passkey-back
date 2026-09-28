import { Controller, Get, Req, Res, UseGuards } from "@nestjs/common";
import type { Request, Response } from "express";

import { OAuthTransactionPurpose } from "../generated/prisma/client";
import { GoogleService } from "../google/google.service";
import { SessionGuard } from "../sessions/session.guard";
import { SessionService } from "../sessions/session.service";

@Controller("step-up/google")
@UseGuards(SessionGuard)
export class GoogleStepUpController {
  constructor(
    private readonly google: GoogleService,
    private readonly sessions: SessionService,
  ) {}

  @Get("start")
  async start(@Req() request: Request, @Res() response: Response) {
    const token =
      (request.cookies?.[this.sessions.cookieName] as string | undefined) ?? "";
    const session = await this.sessions.getActive(token);
    response.redirect(
      await this.google.start(
        OAuthTransactionPurpose.STEP_UP,
        session.userId,
        session.id,
      ),
    );
  }
}
