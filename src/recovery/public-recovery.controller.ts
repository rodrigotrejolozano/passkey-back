import {
  Body,
  Controller,
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
  IsObject,
  IsOptional,
  IsString,
} from "class-validator";
import type { Request, Response } from "express";

import {
  EmailDeliveryMethod,
  OAuthTransactionPurpose,
} from "../generated/prisma/client";
import { GoogleService } from "../google/google.service";
import { RecoverySessionGuard } from "./recovery-session.guard";
import { RecoveryService } from "./recovery.service";

class PublicRecoveryDto {
  @IsEmail() email!: string;
  @IsOptional()
  @IsEnum(EmailDeliveryMethod)
  deliveryMethod?: EmailDeliveryMethod;
}
class PublicRecoveryVerifyDto {
  @IsEmail() email!: string;
  @IsString() @IsNotEmpty() code!: string;
}
class RecoveryCodeDto {
  @IsString() @IsNotEmpty() code!: string;
}
class RestorePasskeyDto {
  @IsString() @IsNotEmpty() challengeId!: string;
  @IsObject()
  response!: Record<string, unknown>;
}

@Controller("recovery")
export class PublicRecoveryController {
  constructor(
    private readonly recovery: RecoveryService,
    private readonly google: GoogleService,
    private readonly config: ConfigService,
  ) {}

  @Post("request")
  async request(@Body() body: PublicRecoveryDto) {
    await this.recovery.requestPublicRecovery(body.email, body.deliveryMethod);
    return { data: { accepted: true } };
  }

  @Post("verify")
  async verify(
    @Body() body: PublicRecoveryVerifyDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    const token = await this.recovery.verifyPublicRecovery(
      body.email,
      body.code,
    );
    this.setRecoveryCookie(response, token);
    return { data: { verified: true } };
  }

  @Post("code")
  async code(
    @Body() body: RecoveryCodeDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    const token = await this.recovery.verifyRecoveryCode(body.code);
    this.setRecoveryCookie(response, token);
    return { data: { verified: true } };
  }

  @Post("restore/passkey/options")
  @UseGuards(RecoverySessionGuard)
  async restorePasskeyOptions(@Req() request: Request) {
    return {
      data: await this.recovery.restorePasskeyOptions(
        this.recoveryToken(request),
      ),
    };
  }

  @Post("restore/passkey/verify")
  @UseGuards(RecoverySessionGuard)
  async restorePasskeyVerify(
    @Req() request: Request,
    @Body() body: RestorePasskeyDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    const token = await this.recovery.verifyRestoredPasskey(
      this.recoveryToken(request),
      body.challengeId,
      body.response,
    );
    response.clearCookie("passkey_recovery", {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
    });
    response.cookie("passkey_session", token, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
    });
    return { data: { restored: true } };
  }

  @Get("google/start")
  @UseGuards(RecoverySessionGuard)
  async restoreGoogle(@Req() request: Request, @Res() response: Response) {
    const recoverySession = await this.recovery.getActiveRecoverySession(
      this.recoveryToken(request),
    );
    response.redirect(
      await this.google.start(
        OAuthTransactionPurpose.RECOVERY_RESTORE,
        recoverySession.userId,
        undefined,
        recoverySession.id,
      ),
    );
  }

  @Get("email/verify-link")
  async verifyMagicLink(
    @Query("challengeId") challengeId: string,
    @Query("token") token: string,
    @Res() response: Response,
  ) {
    try {
      const recoveryToken = await this.recovery.verifyPublicRecoveryMagicLink(
        challengeId ?? "",
        token ?? "",
      );
      this.setRecoveryCookie(response, recoveryToken);
      response.redirect(
        `${this.frontendOrigin}/auth/result?status=success&flow=account-recovery`,
      );
    } catch {
      response.redirect(
        `${this.frontendOrigin}/auth/result?status=error&flow=account-recovery`,
      );
    }
  }

  private recoveryToken(request: Request) {
    return (request.cookies?.passkey_recovery as string | undefined) ?? "";
  }

  private setRecoveryCookie(response: Response, token: string) {
    const timeoutMinutes = Number(
      this.config.get("RECOVERY_SESSION_TIMEOUT_MINUTES") ?? 5,
    );
    response.cookie("passkey_recovery", token, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: timeoutMinutes * 60_000,
    });
  }

  private get frontendOrigin() {
    return (
      this.config.get<string>("FRONTEND_ORIGIN") ?? "http://localhost:3000"
    );
  }
}
