import {
  Body,
  Controller,
  Delete,
  Get,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
} from "class-validator";
import type { Request, Response } from "express";

import { EmailDeliveryMethod } from "../generated/prisma/client";
import { SessionService } from "../sessions/session.service";
import { SessionCsrfGuard } from "../security/csrf.guard";
import { RecoveryService } from "./recovery.service";

class RequestRecoveryEmailDto {
  @IsEmail() email!: string;
  @IsOptional()
  @IsEnum(EmailDeliveryMethod)
  deliveryMethod?: EmailDeliveryMethod;
}
class VerifyRecoveryEmailDto {
  @IsString() @IsNotEmpty() challengeId!: string;
  @IsString() @IsNotEmpty() code!: string;
}

@Controller("security/recovery-email")
@UseGuards(SessionCsrfGuard)
export class RecoveryController {
  constructor(
    private readonly recovery: RecoveryService,
    private readonly sessions: SessionService,
    private readonly config: ConfigService,
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
        body.deliveryMethod,
      ),
    };
  }

  @Get("verification/link")
  async confirmMagicLink(
    @Query("challengeId") challengeId: string,
    @Query("token") token: string,
    @Res() response: Response,
  ) {
    try {
      await this.recovery.verifyRecoveryEmailMagicLink(
        challengeId ?? "",
        token ?? "",
      );
      response.redirect(
        `${this.frontendOrigin}/auth/result?status=success&flow=recovery-email`,
      );
    } catch {
      response.redirect(
        `${this.frontendOrigin}/auth/result?status=error&flow=recovery-email`,
      );
    }
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

  private get frontendOrigin() {
    return (
      this.config.get<string>("FRONTEND_ORIGIN") ?? "http://localhost:3000"
    );
  }
}
