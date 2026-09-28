import {
  Body,
  Controller,
  Get,
  Post,
  Req,
  Res,
  UseGuards,
} from "@nestjs/common";
import { IsNotEmpty, IsObject, IsString, MaxLength } from "class-validator";
import type { Request, Response } from "express";

import { OAuthTransactionPurpose } from "../generated/prisma/client";
import { GoogleService } from "../google/google.service";
import { PasskeyService } from "../passkeys/passkey.service";
import { RateLimitService } from "../rate-limit/rate-limit.service";
import { SessionCsrfGuard } from "../security/csrf.guard";
import { CsrfService } from "../security/csrf.service";
import { SessionGuard } from "../sessions/session.guard";
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
    private readonly csrf: CsrfService,
    private readonly rateLimit: RateLimitService,
  ) {}

  @Get("google/start")
  async startGoogle(@Req() request: Request, @Res() response: Response) {
    await this.limit("google-start", request);
    const transaction = await this.google.start(
      OAuthTransactionPurpose.LOGIN_OR_SIGNUP,
    );
    this.setOAuthCookie(
      response,
      transaction.cookieName,
      transaction.bindingToken,
    );
    response.redirect(transaction.url);
  }

  @Get("google/callback")
  async completeGoogle(@Req() request: Request, @Res() response: Response) {
    await this.limit("google-callback", request, 20);
    const state =
      typeof request.query.state === "string" ? request.query.state : "";
    const code =
      typeof request.query.code === "string" ? request.query.code : "";
    const recoveryToken = request.cookies?.passkey_recovery as
      string | undefined;
    const sessionToken = request.cookies?.[this.sessions.cookieName] as
      string | undefined;
    const purpose = await this.google.getPurpose(state);
    const stepUpSource =
      request.cookies?.passkey_step_up_source === "recovery"
        ? "recovery"
        : "sign-in";
    const bindingCookieName = this.google.bindingCookieName(state);
    const bindingToken = request.cookies?.[bindingCookieName] as
      string | undefined;
    let result;
    try {
      result = await this.google.complete(
        state,
        code,
        recoveryToken,
        sessionToken,
        bindingToken,
      );
    } catch (cause) {
      response.clearCookie(bindingCookieName, {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        path: "/",
      });
      response.clearCookie("passkey_step_up_source", { path: "/" });
      if (
        purpose === OAuthTransactionPurpose.RECOVERY_RESTORE ||
        purpose === OAuthTransactionPurpose.STEP_UP
      ) {
        const flow =
          purpose === OAuthTransactionPurpose.RECOVERY_RESTORE
            ? "recovery"
            : "step-up";
        const source =
          purpose === OAuthTransactionPurpose.STEP_UP
            ? `&source=${stepUpSource}`
            : "";
        response.redirect(
          `${process.env.FRONTEND_ORIGIN ?? "http://localhost:3000"}/auth/result?status=error&flow=${flow}${source}`,
        );
        return;
      }
      throw cause;
    }
    response.clearCookie(bindingCookieName, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
    });
    response.clearCookie("passkey_step_up_source", { path: "/" });
    this.setSessionCookie(response, result.token);
    if (result.purpose === OAuthTransactionPurpose.RECOVERY_RESTORE) {
      response.clearCookie("passkey_recovery", {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        path: "/",
      });
    }
    const flow =
      result.purpose === OAuthTransactionPurpose.RECOVERY_RESTORE
        ? "recovery"
        : result.purpose === OAuthTransactionPurpose.STEP_UP
          ? "step-up"
          : "auth";
    const isNewAccount = result.isNewAccount ? "&new=1" : "";
    const source =
      result.purpose === OAuthTransactionPurpose.STEP_UP
        ? `&source=${stepUpSource}`
        : "";
    response.redirect(
      `${process.env.FRONTEND_ORIGIN ?? "http://localhost:3000"}/auth/result?status=success&flow=${flow}${isNewAccount}${source}`,
    );
  }

  @Post("passkey/registration/options")
  async registrationOptions(
    @Req() request: Request,
    @Body() body: RegistrationOptionsDto,
  ) {
    await this.limit("passkey-registration", request);
    return {
      data: await this.passkeys.registrationOptions(body.displayName.trim()),
    };
  }

  @Post("passkey/registration/verify")
  async verifyRegistration(
    @Req() request: Request,
    @Body() body: VerifyPasskeyDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    await this.limit("passkey-registration", request);
    const token = await this.passkeys.verifyRegistration(
      body.challengeId,
      body.response,
    );
    this.setSessionCookie(response, token);
    return { data: { authenticated: true, isNewAccount: true } };
  }

  @Post("passkey/authentication/options")
  async authenticationOptions(@Req() request: Request) {
    await this.limit("passkey-login", request);
    return { data: await this.passkeys.authenticationOptions() };
  }

  @Post("passkey/authentication/verify")
  async verifyAuthentication(
    @Req() request: Request,
    @Body() body: VerifyPasskeyDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    await this.limit("passkey-login", request);
    const token = await this.passkeys.verifyAuthentication(
      body.challengeId,
      body.response,
    );
    this.setSessionCookie(response, token);
    return { data: { authenticated: true, isNewAccount: false } };
  }

  @Get("me")
  @UseGuards(SessionGuard)
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

  @Get("csrf")
  async csrfToken(@Req() request: Request) {
    const token = request.cookies?.[this.sessions.cookieName] as
      string | undefined;
    return {
      data: { csrfToken: await this.csrf.issueSessionToken(token ?? "") },
    };
  }

  @Post("logout")
  @UseGuards(SessionGuard, SessionCsrfGuard)
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

  private setOAuthCookie(
    response: Response,
    cookieName: string,
    token: string,
  ): void {
    response.cookie(cookieName, token, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 300_000,
    });
  }

  private limit(scope: string, request: Request, limit = 10): Promise<void> {
    return this.rateLimit.assertAllowed(
      scope,
      request.ip ?? "unknown",
      limit,
      60,
    );
  }
}
