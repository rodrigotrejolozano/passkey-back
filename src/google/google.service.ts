import {
  BadRequestException,
  ConflictException,
  Injectable,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { OAuth2Client } from "google-auth-library";
import { createHmac } from "node:crypto";

import { RandomSource } from "../common/random-source";
import { PrismaService } from "../database/prisma.service";
import {
  IdentityProvider,
  OAuthTransactionPurpose,
  SessionAuthMethod,
} from "../generated/prisma/client";
import { SessionService } from "../sessions/session.service";

@Injectable()
export class GoogleService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly random: RandomSource,
    private readonly sessions: SessionService,
    private readonly config: ConfigService,
  ) {}

  bindingCookieName(state: string): string {
    return `passkey_oauth_${state}`;
  }

  async start(
    purpose: OAuthTransactionPurpose,
    userId?: string,
    sessionId?: string,
    recoverySessionId?: string,
  ): Promise<{ url: string; bindingToken: string; cookieName: string }> {
    const state = this.random.token();
    const nonce = this.random.token();
    const bindingToken = this.random.token();
    await this.prisma.oAuthTransaction.create({
      data: {
        state,
        nonce,
        browserBindingHash: this.hash(bindingToken),
        purpose,
        userId,
        sessionId,
        recoverySessionId,
        expiresAt: new Date(Date.now() + 300_000),
      },
    });
    const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    url.searchParams.set("client_id", this.clientId);
    url.searchParams.set("redirect_uri", this.redirectUri);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("scope", "openid email profile");
    url.searchParams.set("state", state);
    url.searchParams.set("nonce", nonce);
    if (purpose === OAuthTransactionPurpose.STEP_UP) {
      url.searchParams.set("prompt", "login");
      url.searchParams.set("max_age", "300");
    } else {
      url.searchParams.set("prompt", "select_account");
    }
    return {
      url: url.toString(),
      bindingToken,
      cookieName: this.bindingCookieName(state),
    };
  }

  async getPurpose(state: string): Promise<OAuthTransactionPurpose> {
    const transaction = await this.prisma.oAuthTransaction.findUnique({
      where: { state },
      select: { purpose: true, consumedAt: true, expiresAt: true },
    });
    if (
      !transaction ||
      transaction.consumedAt ||
      transaction.expiresAt <= new Date()
    )
      throw this.invalidTransaction();
    return transaction.purpose;
  }

  async complete(
    state: string,
    code: string,
    recoveryToken?: string,
    sessionToken?: string,
    bindingToken?: string,
  ): Promise<{
    token: string;
    isNewAccount: boolean;
    purpose: OAuthTransactionPurpose;
  }> {
    const transaction = await this.prisma.oAuthTransaction.findUnique({
      where: { state },
    });
    if (
      !transaction ||
      !bindingToken ||
      transaction.browserBindingHash !== this.hash(bindingToken) ||
      transaction.consumedAt ||
      transaction.expiresAt <= new Date()
    )
      throw this.invalidTransaction();
    const consumed = await this.prisma.oAuthTransaction.updateMany({
      where: {
        id: transaction.id,
        browserBindingHash: this.hash(bindingToken),
        consumedAt: null,
        expiresAt: { gt: new Date() },
      },
      data: { consumedAt: new Date() },
    });
    if (consumed.count !== 1) throw this.invalidTransaction();
    const client = new OAuth2Client(
      this.clientId,
      this.clientSecret,
      this.redirectUri,
    );
    const tokens = await client.getToken(code);
    if (!tokens.tokens.id_token) throw this.invalidTransaction();
    const ticket = await client.verifyIdToken({
      idToken: tokens.tokens.id_token,
      audience: this.clientId,
    });
    const claims = ticket.getPayload();
    if (!claims?.sub || claims.nonce !== transaction.nonce)
      throw this.invalidTransaction();
    const authTime = (claims as typeof claims & { auth_time?: unknown })
      .auth_time;
    // Google can omit auth_time; prompt=login still forces provider reauthentication.
    if (
      transaction.purpose === OAuthTransactionPurpose.STEP_UP &&
      authTime !== undefined &&
      (typeof authTime !== "number" || authTime * 1000 < Date.now() - 300_000)
    )
      throw this.invalidTransaction();
    const existing = await this.prisma.externalIdentity.findUnique({
      where: {
        provider_providerSubjectId: {
          provider: IdentityProvider.GOOGLE,
          providerSubjectId: claims.sub,
        },
      },
    });
    if (transaction.purpose === OAuthTransactionPurpose.LINK) {
      if (!transaction.userId || !transaction.sessionId || !sessionToken)
        throw this.invalidTransaction();
      const session = await this.sessions.getActive(sessionToken);
      if (
        session.id !== transaction.sessionId ||
        session.userId !== transaction.userId
      )
        throw this.invalidTransaction();
      await this.sessions.requireStepUp(session.id);
      if (existing && existing.userId !== transaction.userId)
        throw new ConflictException({
          error: {
            code: "GOOGLE_ALREADY_LINKED",
            message: "This Google account belongs to another user.",
          },
        });
      if (!existing)
        await this.prisma.externalIdentity.create({
          data: {
            userId: transaction.userId,
            provider: IdentityProvider.GOOGLE,
            providerSubjectId: claims.sub,
            providerEmail: claims.email,
          },
        });
      return {
        token: sessionToken,
        isNewAccount: false,
        purpose: transaction.purpose,
      };
    }
    if (transaction.purpose === OAuthTransactionPurpose.STEP_UP) {
      if (!transaction.userId || !transaction.sessionId || !sessionToken)
        throw this.invalidTransaction();
      const session = await this.sessions.getActive(sessionToken);
      if (
        session.id !== transaction.sessionId ||
        session.userId !== transaction.userId
      )
        throw this.invalidTransaction();
      if (!existing || existing.userId !== transaction.userId)
        throw new ConflictException({
          error: {
            code: "GOOGLE_STEP_UP_ACCOUNT_MISMATCH",
            message: "Use the Google account linked to this user.",
          },
        });
      await this.sessions.markStepUp(session.id);
      return {
        token: sessionToken,
        isNewAccount: false,
        purpose: transaction.purpose,
      };
    }
    if (transaction.purpose === OAuthTransactionPurpose.RECOVERY_RESTORE) {
      if (
        !transaction.userId ||
        !transaction.recoverySessionId ||
        !recoveryToken
      )
        throw this.invalidTransaction();
      const token = await this.prisma.$transaction(async (database) => {
        const recoverySession = await database.recoverySession.updateMany({
          where: {
            id: transaction.recoverySessionId!,
            userId: transaction.userId!,
            tokenHash: this.hash(recoveryToken),
            consumedAt: null,
            revokedAt: null,
            expiresAt: { gt: new Date() },
          },
          data: { consumedAt: new Date() },
        });
        if (recoverySession.count !== 1) throw this.invalidTransaction();

        const recoveredUserIdentity =
          await database.externalIdentity.findUnique({
            where: {
              userId_provider: {
                userId: transaction.userId!,
                provider: IdentityProvider.GOOGLE,
              },
            },
          });
        if (
          (existing && existing.userId !== transaction.userId) ||
          (recoveredUserIdentity &&
            recoveredUserIdentity.providerSubjectId !== claims.sub)
        )
          throw this.invalidTransaction();
        if (!existing) {
          await database.externalIdentity.create({
            data: {
              userId: transaction.userId!,
              provider: IdentityProvider.GOOGLE,
              providerSubjectId: claims.sub,
              providerEmail: claims.email,
            },
          });
        }
        return this.sessions.create(
          transaction.userId!,
          SessionAuthMethod.RECOVERY_RESTORED,
          database,
        );
      });
      return { token, isNewAccount: false, purpose: transaction.purpose };
    }
    if (transaction.purpose !== OAuthTransactionPurpose.LOGIN_OR_SIGNUP)
      throw this.invalidTransaction();
    if (existing)
      return {
        token: await this.sessions.create(
          existing.userId,
          SessionAuthMethod.GOOGLE,
        ),
        isNewAccount: false,
        purpose: transaction.purpose,
      };
    const user = await this.prisma.user.create({
      data: {
        displayName: claims.name || "Google user",
        externalIdentities: {
          create: {
            provider: IdentityProvider.GOOGLE,
            providerSubjectId: claims.sub,
            providerEmail: claims.email,
          },
        },
      },
    });
    return {
      token: await this.sessions.create(user.id, SessionAuthMethod.GOOGLE),
      isNewAccount: true,
      purpose: transaction.purpose,
    };
  }

  private get clientId(): string {
    return this.config.getOrThrow<string>("GOOGLE_CLIENT_ID");
  }
  private get clientSecret(): string {
    return this.config.getOrThrow<string>("GOOGLE_CLIENT_SECRET");
  }
  private get redirectUri(): string {
    return this.config.getOrThrow<string>("GOOGLE_REDIRECT_URI");
  }
  private hash(value: string): string {
    return createHmac(
      "sha256",
      this.config.getOrThrow<string>("SESSION_SECRET"),
    )
      .update(value)
      .digest("base64url");
  }
  private invalidTransaction() {
    return new BadRequestException({
      error: {
        code: "GOOGLE_AUTH_FAILED",
        message: "Google authentication could not be completed.",
      },
    });
  }
}
