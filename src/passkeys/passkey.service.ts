import { BadRequestException, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
} from "@simplewebauthn/server";
import { randomBytes } from "node:crypto";

import { ChallengeStore } from "../challenges/challenge.store";
import { PrismaService } from "../database/prisma.service";
import {
  SessionAuthMethod,
  WebAuthnChallengeType,
} from "../generated/prisma/client";
import { SessionService } from "../sessions/session.service";

@Injectable()
export class PasskeyService {
  constructor(
    private readonly challenges: ChallengeStore,
    private readonly prisma: PrismaService,
    private readonly sessions: SessionService,
    private readonly config: ConfigService,
  ) {}

  async registrationOptions(displayName: string) {
    const userHandle = randomBytes(32);
    const options = await generateRegistrationOptions({
      rpID: this.rpId,
      rpName: this.rpName,
      userID: userHandle,
      userName: `passkey-${userHandle.toString("base64url")}`,
      userDisplayName: displayName,
      authenticatorSelection: {
        residentKey: "required",
        userVerification: "required",
      },
    });
    const challenge = await this.challenges.create({
      challenge: options.challenge,
      type: WebAuthnChallengeType.REGISTRATION,
      pendingUserHandle: userHandle,
      pendingDisplayName: displayName,
      expiresAt: this.challengeExpiry,
    });
    return { challengeId: challenge.id, options };
  }

  async verifyRegistration(
    challengeId: string,
    response: unknown,
  ): Promise<string> {
    const challenge = await this.challenges.consume(challengeId, new Date());
    if (
      !challenge ||
      challenge.type !== WebAuthnChallengeType.REGISTRATION ||
      !challenge.pendingUserHandle ||
      !challenge.pendingDisplayName
    ) {
      throw new BadRequestException({
        error: {
          code: "CHALLENGE_INVALID",
          message: "This passkey request is no longer valid.",
        },
      });
    }
    const verification = await verifyRegistrationResponse({
      response: response as never,
      expectedChallenge: challenge.challenge,
      expectedOrigin: this.origin,
      expectedRPID: this.rpId,
      requireUserVerification: true,
    });
    if (!verification.verified || !verification.registrationInfo) {
      throw new BadRequestException({
        error: {
          code: "PASSKEY_VERIFICATION_FAILED",
          message: "Passkey verification failed.",
        },
      });
    }
    const { credential, credentialDeviceType, credentialBackedUp } =
      verification.registrationInfo;
    const user = await this.prisma.user.create({
      data: {
        displayName: challenge.pendingDisplayName,
        passkeys: {
          create: {
            credentialId: credential.id,
            publicKey: credential.publicKey,
            counter: BigInt(credential.counter),
            transports: credential.transports ?? [],
            deviceType: credentialDeviceType,
            backedUp: credentialBackedUp,
            name: "New passkey",
          },
        },
      },
    });
    return this.sessions.create(user.id, SessionAuthMethod.PASSKEY);
  }

  async authenticationOptions() {
    const options = await generateAuthenticationOptions({
      rpID: this.rpId,
      userVerification: "required",
    });
    const challenge = await this.challenges.create({
      challenge: options.challenge,
      type: WebAuthnChallengeType.AUTHENTICATION,
      expiresAt: this.challengeExpiry,
    });
    return { challengeId: challenge.id, options };
  }

  async stepUpOptions(sessionId: string, userId: string) {
    const credentials = await this.prisma.passkeyCredential.findMany({
      where: { userId },
      select: { credentialId: true, transports: true },
    });
    const options = await generateAuthenticationOptions({
      rpID: this.rpId,
      userVerification: "required",
      allowCredentials: credentials.map((credential) => ({
        id: credential.credentialId,
        transports: credential.transports as never,
      })),
    });
    const challenge = await this.challenges.create({
      challenge: options.challenge,
      type: WebAuthnChallengeType.AUTHENTICATION,
      sessionId,
      expiresAt: this.challengeExpiry,
    });
    return { challengeId: challenge.id, options };
  }

  async verifyStepUp(
    challengeId: string,
    sessionId: string,
    response: { id?: string } & Record<string, unknown>,
  ): Promise<void> {
    const challenge = await this.challenges.consume(challengeId, new Date());
    if (
      !challenge ||
      challenge.sessionId !== sessionId ||
      challenge.type !== WebAuthnChallengeType.AUTHENTICATION ||
      !response.id
    )
      throw new BadRequestException({
        error: {
          code: "CHALLENGE_INVALID",
          message: "This passkey request is no longer valid.",
        },
      });
    const credential = await this.prisma.passkeyCredential.findUnique({
      where: { credentialId: response.id },
    });
    const session = await this.prisma.session.findUnique({
      where: { id: sessionId },
    });
    if (!credential || !session || credential.userId !== session.userId)
      throw new BadRequestException({
        error: {
          code: "PASSKEY_VERIFICATION_FAILED",
          message: "Passkey verification failed.",
        },
      });
    const verification = await verifyAuthenticationResponse({
      response: response as never,
      expectedChallenge: challenge.challenge,
      expectedOrigin: this.origin,
      expectedRPID: this.rpId,
      requireUserVerification: true,
      credential: {
        id: credential.credentialId,
        publicKey: credential.publicKey,
        counter: Number(credential.counter),
        transports: credential.transports as never,
      },
    });
    if (!verification.verified)
      throw new BadRequestException({
        error: {
          code: "PASSKEY_VERIFICATION_FAILED",
          message: "Passkey verification failed.",
        },
      });
    await this.prisma.passkeyCredential.update({
      where: { id: credential.id },
      data: {
        counter: BigInt(verification.authenticationInfo.newCounter),
        lastUsedAt: new Date(),
      },
    });
    await this.sessions.markStepUp(sessionId);
  }

  async verifyAuthentication(
    challengeId: string,
    response: { id?: string } & Record<string, unknown>,
  ): Promise<string> {
    const challenge = await this.challenges.consume(challengeId, new Date());
    if (
      !challenge ||
      challenge.type !== WebAuthnChallengeType.AUTHENTICATION ||
      !response.id
    ) {
      throw new BadRequestException({
        error: {
          code: "CHALLENGE_INVALID",
          message: "This passkey request is no longer valid.",
        },
      });
    }
    const credential = await this.prisma.passkeyCredential.findUnique({
      where: { credentialId: response.id },
    });
    if (!credential) {
      throw new BadRequestException({
        error: {
          code: "PASSKEY_VERIFICATION_FAILED",
          message: "Passkey verification failed.",
        },
      });
    }
    const verification = await verifyAuthenticationResponse({
      response: response as never,
      expectedChallenge: challenge.challenge,
      expectedOrigin: this.origin,
      expectedRPID: this.rpId,
      requireUserVerification: true,
      credential: {
        id: credential.credentialId,
        publicKey: credential.publicKey,
        counter: Number(credential.counter),
        transports: credential.transports as never,
      },
    });
    if (!verification.verified) {
      throw new BadRequestException({
        error: {
          code: "PASSKEY_VERIFICATION_FAILED",
          message: "Passkey verification failed.",
        },
      });
    }
    await this.prisma.passkeyCredential.update({
      where: { id: credential.id },
      data: {
        counter: BigInt(verification.authenticationInfo.newCounter),
        lastUsedAt: new Date(),
      },
    });
    return this.sessions.create(credential.userId, SessionAuthMethod.PASSKEY);
  }

  private get rpId(): string {
    return this.config.get<string>("WEBAUTHN_RP_ID") ?? "localhost";
  }
  private get rpName(): string {
    return this.config.get<string>("WEBAUTHN_RP_NAME") ?? "Passwordless Local";
  }
  private get origin(): string {
    return (
      this.config.get<string>("WEBAUTHN_ORIGIN") ?? "http://localhost:3000"
    );
  }
  private get challengeExpiry(): Date {
    return new Date(
      Date.now() +
        Number(this.config.get("WEBAUTHN_CHALLENGE_TTL_SECONDS") ?? 300) * 1000,
    );
  }
}
