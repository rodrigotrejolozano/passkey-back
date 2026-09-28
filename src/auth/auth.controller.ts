import { Body, Controller, Get, Post, Req, Res } from "@nestjs/common";
import { IsNotEmpty, IsObject, IsString, MaxLength } from "class-validator";
import type { Request, Response } from "express";

import { OAuthTransactionPurpose } from "../generated/prisma/client";
import { GoogleService } from "../google/google.service";
import { PasskeyService } from "../passkeys/passkey.service";
import { SessionService } from "../sessions/session.service";

class RegistrationOptionsDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  displayName!: string;
}

class VerifyPasskeyDto {
  @IsString()
  @IsNotEmpty()
  challengeId!: string;

  @IsObject()
  response!: Record<string, unknown>;
}

@Controller("auth")
export class AuthController {
  constructor(
    private readonly passkeys: PasskeyService,
    private readonly sessions: SessionService,
    private readonly google: GoogleService,
  ) {}

  @Get("google/start")
  async startGoogle(@Res() response: Response) {
    response.redirect(
      await this.google.start(OAuthTransactionPurpose.LOGIN_OR_SIGNUP),
    );
  }

  @Get("google/callback")
  async completeGoogle(@Req() request: Request, @Res() response: Response) {
    const state =
      typeof request.query.state === "string" ? request.query.state : "";
    const code =
      typeof request.query.code === "string" ? request.query.code : "";
    const result = await this.google.complete(state, code);
    this.setSessionCookie(response, result.token);
    response.redirect(
      `${process.env.FRONTEND_ORIGIN ?? "http://localhost:3000"}/auth/result?status=success`,
    );
  }

  @Post("passkey/registration/options")
  async registrationOptions(@Body() body: RegistrationOptionsDto) {
    return {
      data: await this.passkeys.registrationOptions(body.displayName.trim()),
    };
  }

  @Post("passkey/registration/verify")
  async verifyRegistration(
    @Body() body: VerifyPasskeyDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    const token = await this.passkeys.verifyRegistration(
      body.challengeId,
      body.response,
    );
    this.setSessionCookie(response, token);
    return { data: { authenticated: true, isNewAccount: true } };
  }

  @Post("passkey/authentication/options")
  async authenticationOptions() {
    return { data: await this.passkeys.authenticationOptions() };
  }

  @Post("passkey/authentication/verify")
  async verifyAuthentication(
    @Body() body: VerifyPasskeyDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    const token = await this.passkeys.verifyAuthentication(
      body.challengeId,
      body.response,
    );
    this.setSessionCookie(response, token);
    return { data: { authenticated: true, isNewAccount: false } };
  }

  @Get("me")
  async me(@Req() request: Request) {
    const token = request.cookies?.[this.sessions.cookieName] as
      string | undefined;
    const session = await this.sessions.getActive(token ?? "");
    return {
      data: {
        user: {
          id: session.user.id,
          displayName: session.user.displayName,
          createdAt: session.user.createdAt,
        },
        authMethod: session.authMethod,
      },
    };
  }

  @Post("logout")
  async logout(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const token = request.cookies?.[this.sessions.cookieName] as
      string | undefined;
    if (token) await this.sessions.revoke(token);
    response.clearCookie(this.sessions.cookieName, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
    });
    return { data: { loggedOut: true } };
  }

  private setSessionCookie(response: Response, token: string): void {
    response.cookie(this.sessions.cookieName, token, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
    });
  }
}
