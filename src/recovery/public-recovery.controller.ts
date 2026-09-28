import { Body, Controller, Post, Res } from "@nestjs/common";
import { IsEmail, IsNotEmpty, IsString } from "class-validator";
import type { Response } from "express";

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

@Controller("recovery")
export class PublicRecoveryController {
  constructor(private readonly recovery: RecoveryService) {}

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
}
