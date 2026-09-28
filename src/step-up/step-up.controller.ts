import { Body, Controller, Post, Req, UseGuards } from "@nestjs/common";
import { IsNotEmpty, IsObject, IsString } from "class-validator";
import type { Request } from "express";

import { PasskeyService } from "../passkeys/passkey.service";
import { SessionCsrfGuard } from "../security/csrf.guard";
import { SessionService } from "../sessions/session.service";
import { SessionGuard } from "../sessions/session.guard";

class VerifyStepUpDto {
  @IsString() @IsNotEmpty() challengeId!: string;
  @IsObject() response!: Record<string, unknown>;
}

@Controller("step-up/passkey")
@UseGuards(SessionGuard, SessionCsrfGuard)
export class StepUpController {
  constructor(
    private readonly passkeys: PasskeyService,
    private readonly sessions: SessionService,
  ) {}

  @Post("options")
  async options(@Req() request: Request) {
    const session = await this.current(request);
    return {
      data: await this.passkeys.stepUpOptions(session.id, session.userId),
    };
  }

  @Post("verify")
  async verify(@Req() request: Request, @Body() body: VerifyStepUpDto) {
    const session = await this.current(request);
    await this.passkeys.verifyStepUp(
      body.challengeId,
      session.id,
      body.response,
    );
    return { data: { verified: true } };
  }

  private async current(request: Request) {
    const token = request.cookies?.[this.sessions.cookieName] as
      string | undefined;
    return this.sessions.getActive(token ?? "");
  }
}
