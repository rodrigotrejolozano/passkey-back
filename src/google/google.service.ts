import {
  BadRequestException,
  ConflictException,
  Injectable,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { OAuth2Client } from "google-auth-library";

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

  async start(
    purpose: OAuthTransactionPurpose,
    userId?: string,
    sessionId?: string,
  ): Promise<string> {
    const state = this.random.token();
    const nonce = this.random.token();
    await this.prisma.oAuthTransaction.create({
      data: {
        state,
        nonce,
        purpose,
        userId,
        sessionId,
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
    url.searchParams.set("prompt", "select_account");
    return url.toString();
  }

  async complete(
    state: string,
    code: string,
  ): Promise<{ token: string; isNewAccount: boolean }> {
    const transaction = await this.prisma.oAuthTransaction.findUnique({
      where: { state },
    });
    if (
      !transaction ||
      transaction.consumedAt ||
      transaction.expiresAt <= new Date()
    )
      throw this.invalidTransaction();
    const consumed = await this.prisma.oAuthTransaction.updateMany({
      where: { id: transaction.id, consumedAt: null },
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
    const existing = await this.prisma.externalIdentity.findUnique({
      where: {
        provider_providerSubjectId: {
          provider: IdentityProvider.GOOGLE,
          providerSubjectId: claims.sub,
        },
      },
    });
    if (transaction.purpose === OAuthTransactionPurpose.LINK) {
      if (!transaction.userId) throw this.invalidTransaction();
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
        token: await this.sessions.create(
          transaction.userId,
          SessionAuthMethod.GOOGLE,
        ),
        isNewAccount: false,
      };
    }
    if (existing)
      return {
        token: await this.sessions.create(
          existing.userId,
          SessionAuthMethod.GOOGLE,
        ),
        isNewAccount: false,
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
  private invalidTransaction() {
    return new BadRequestException({
      error: {
        code: "GOOGLE_AUTH_FAILED",
        message: "Google authentication could not be completed.",
      },
    });
  }
}
