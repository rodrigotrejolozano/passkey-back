import { Body, Controller, Delete, Get, Post, Req } from "@nestjs/common";
import { IsEmail, IsNotEmpty, IsString } from "class-validator";
import type { Request } from "express";

import { SessionService } from "../sessions/session.service";
import { RecoveryService } from "./recovery.service";

class RequestRecoveryEmailDto {
  @IsEmail() email!: string;
}
class VerifyRecoveryEmailDto {
  @IsString() @IsNotEmpty() challengeId!: string;
  @IsString() @IsNotEmpty() code!: string;
}

@Controller("security/recovery-email")
export class RecoveryController {
  constructor(
    private readonly recovery: RecoveryService,
    private readonly sessions: SessionService,
  ) {}

  @Get()
  async get(@Req() request: Request) {
    const session = await this.current(request);
    const recoveryEmail = await this.recovery.getRecoveryEmail(session.userId);
    return { data: { recoveryEmail } };
  }

  @Post("verification")
  async requestVerification(
    @Req() request: Request,
    @Body() body: RequestRecoveryEmailDto,
  ) {
    const session = await this.current(request);
    await this.sessions.requireStepUp(session.id);
    return {
      data: await this.recovery.requestRecoveryEmailVerification(
        session.userId,
        body.email,
      ),
    };
  }

  @Post("verification/confirm")
  async confirmVerification(
    @Req() request: Request,
    @Body() body: VerifyRecoveryEmailDto,
  ) {
    const session = await this.current(request);
    await this.sessions.requireStepUp(session.id);
    await this.recovery.verifyRecoveryEmail(
      session.userId,
      body.challengeId,
      body.code,
    );
    return { data: { verified: true } };
  }

  @Delete()
  async remove(@Req() request: Request) {
    const session = await this.current(request);
    await this.sessions.requireStepUp(session.id);
    await this.recovery.removeRecoveryEmail(session.userId);
    return { data: { removed: true } };
  }

  @Post("codes")
  async generateCodes(@Req() request: Request) {
    const session = await this.current(request);
    await this.sessions.requireStepUp(session.id);
    return {
      data: {
        codes: await this.recovery.generateRecoveryCodes(session.userId),
      },
    };
  }

  private async current(request: Request) {
    const token = request.cookies?.[this.sessions.cookieName] as
      string | undefined;
    return this.sessions.getActive(token ?? "");
  }
}
