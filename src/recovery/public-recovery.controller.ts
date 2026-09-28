import { Body, Controller, Get, Post, Req, Res } from "@nestjs/common";
import { IsEmail, IsNotEmpty, IsObject, IsString } from "class-validator";
import type { Request, Response } from "express";

import { OAuthTransactionPurpose } from "../generated/prisma/client";
import { GoogleService } from "../google/google.service";
import { RecoveryService } from "./recovery.service";

class PublicRecoveryDto {
  @IsEmail() email!: string;
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
  ) {}

  @Post("request")
  async request(@Body() body: PublicRecoveryDto) {
    await this.recovery.requestPublicRecovery(body.email);
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
    response.cookie("passkey_recovery", token, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
    });
    return { data: { verified: true } };
  }

  @Post("code")
  async code(
    @Body() body: RecoveryCodeDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    const token = await this.recovery.verifyRecoveryCode(body.code);
    response.cookie("passkey_recovery", token, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
    });
    return { data: { verified: true } };
  }

  @Post("restore/passkey/options")
  async restorePasskeyOptions(@Req() request: Request) {
    return {
      data: await this.recovery.restorePasskeyOptions(
        this.recoveryToken(request),
      ),
    };
  }

  @Post("restore/passkey/verify")
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

  private recoveryToken(request: Request) {
    return (request.cookies?.passkey_recovery as string | undefined) ?? "";
  }
}
