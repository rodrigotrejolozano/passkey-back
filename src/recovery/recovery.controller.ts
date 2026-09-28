import { Body, Controller, Delete, Get, Post, Req, Res } from "@nestjs/common";
import { IsEmail, IsNotEmpty, IsString } from "class-validator";
import type { Request, Response } from "express";

import { SessionService } from "../sessions/session.service";
import { RecoveryService } from "./recovery.service";

class RequestRecoveryEmailDto {
  @IsEmail() email!: string;
}
class VerifyRecoveryEmailDto {
  @IsString() @IsNotEmpty() challengeId!: string;
  @IsString() @IsNotEmpty() code!: string;
}
class PublicRecoveryDto {
  @IsEmail() email!: string;
}
class PublicRecoveryVerifyDto {
  @IsEmail() email!: string;
  @IsString() @IsNotEmpty() code!: string;
}

@Controller("security/recovery-email")
export class RecoveryController {
  constructor(
    private readonly recovery: RecoveryService,
    private readonly sessions: SessionService,
  ) {}

  @Post("/recovery/request")
  async requestPublicRecovery(@Body() body: PublicRecoveryDto) {
    await this.recovery.requestPublicRecovery(body.email);
    return { data: { accepted: true } };
  }

  @Post("/recovery/verify")
  async verifyPublicRecovery(
    @Body() body: PublicRecoveryVerifyDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    const token = await this.recovery.verifyPublicRecovery(
      body.email,
      body.code,
    );
    response.cookie("passkey_recovery", token, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
    });
    return { data: { verified: true } };
  }

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

  private async current(request: Request) {
    const token = request.cookies?.[this.sessions.cookieName] as
      string | undefined;
    return this.sessions.getActive(token ?? "");
  }
}
