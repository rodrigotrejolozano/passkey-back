import {
  Body,
  ConflictException,
  Controller,
  Delete,
  Get,
  Patch,
  Post,
  Req,
  Res,
} from "@nestjs/common";
import { IsNotEmpty, IsObject, IsString } from "class-validator";
import type { Request, Response } from "express";

import { PrismaService } from "../database/prisma.service";
import { GoogleService } from "../google/google.service";
import { OAuthTransactionPurpose } from "../generated/prisma/client";
import { PasskeyService } from "../passkeys/passkey.service";
import { SessionService } from "../sessions/session.service";

class VerifyPasskeyDto {
  @IsString()
  @IsNotEmpty()
  challengeId!: string;

  @IsObject()
  response!: Record<string, unknown>;
}

class UpdateProfileDto {
  @IsString()
  @IsNotEmpty()
  displayName!: string;
}

class RenamePasskeyDto {
  @IsString()
  @IsNotEmpty()
  name!: string;
}

@Controller("security")
export class SecurityController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sessions: SessionService,
    private readonly passkeysService: PasskeyService,
    private readonly google: GoogleService,
  ) {}

  @Get("passkeys")
  async passkeys(@Req() request: Request) {
    const session = await this.currentSession(request);
    const passkeys = await this.prisma.passkeyCredential.findMany({
      where: { userId: session.userId },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        name: true,
        createdAt: true,
        lastUsedAt: true,
        deviceType: true,
        backedUp: true,
      },
    });
    return { data: { passkeys } };
  }

  @Post("passkeys/options")
  async addPasskeyOptions(@Req() request: Request) {
    const session = await this.currentSession(request);
    await this.sessions.requireStepUp(session.id);
    return {
      data: await this.passkeysService.addOptions(session.id, session.userId),
    };
  }

  @Post("passkeys/verify")
  async addPasskeyVerify(
    @Req() request: Request,
    @Body() body: VerifyPasskeyDto,
  ) {
    const session = await this.currentSession(request);
    await this.sessions.requireStepUp(session.id);
    await this.passkeysService.verifyAddedPasskey(
      body.challengeId,
      session.id,
      session.userId,
      body.response,
    );
    return { data: { added: true } };
  }

  @Patch("passkeys/:id")
  async renamePasskey(@Req() request: Request, @Body() body: RenamePasskeyDto) {
    const session = await this.currentSession(request);
    await this.sessions.requireStepUp(session.id);
    await this.prisma.passkeyCredential.updateMany({
      where: { id: String(request.params.id), userId: session.userId },
      data: { name: body.name.trim() },
    });
    return { data: { renamed: true } };
  }

  @Delete("passkeys/:id")
  async removePasskey(@Req() request: Request) {
    const session = await this.currentSession(request);
    await this.sessions.requireStepUp(session.id);
    await this.withMultipleMethods(session.userId, async (transaction) => {
      await transaction.passkeyCredential.deleteMany({
        where: { id: String(request.params.id), userId: session.userId },
      });
    });
    return { data: { removed: true } };
  }

  @Get("google")
  async googleStatus(@Req() request: Request) {
    const session = await this.currentSession(request);
    const identity = await this.prisma.externalIdentity.findFirst({
      where: { userId: session.userId, provider: "GOOGLE" },
      select: { providerEmail: true, createdAt: true },
    });
    return { data: { identity } };
  }

  @Get("profile")
  async profile(@Req() request: Request) {
    const session = await this.currentSession(request);
    return {
      data: {
        displayName: session.user.displayName,
        createdAt: session.user.createdAt,
      },
    };
  }

  @Patch("profile")
  async updateProfile(@Req() request: Request, @Body() body: UpdateProfileDto) {
    const session = await this.currentSession(request);
    const user = await this.prisma.user.update({
      where: { id: session.userId },
      data: { displayName: body.displayName.trim() },
      select: { displayName: true },
    });
    return { data: user };
  }

  @Get("google/connect")
  async connectGoogle(@Req() request: Request, @Res() response: Response) {
    const session = await this.currentSession(request);
    await this.sessions.requireStepUp(session.id);
    response.redirect(
      await this.google.start(
        OAuthTransactionPurpose.LINK,
        session.userId,
        session.id,
      ),
    );
  }

  @Delete("google")
  async disconnectGoogle(@Req() request: Request) {
    const session = await this.currentSession(request);
    await this.sessions.requireStepUp(session.id);
    await this.withMultipleMethods(session.userId, async (transaction) => {
      await transaction.externalIdentity.deleteMany({
        where: { userId: session.userId, provider: "GOOGLE" },
      });
    });
    return { data: { disconnected: true } };
  }

  private async withMultipleMethods(
    userId: string,
    action: (transaction: PrismaService) => Promise<void>,
  ) {
    await this.prisma.$transaction(async (transaction) => {
      await transaction.$queryRaw`SELECT id FROM "User" WHERE id = ${userId} FOR UPDATE`;
      const methods = await Promise.all([
        transaction.passkeyCredential.count({ where: { userId } }),
        transaction.externalIdentity.count({
          where: { userId, provider: "GOOGLE" },
        }),
      ]);
      if (methods[0] + methods[1] <= 1)
        throw new ConflictException({
          error: {
            code: "LAST_AUTH_METHOD",
            message: "You cannot remove your last sign-in method.",
          },
        });
      await action(transaction as PrismaService);
    });
  }

  private async currentSession(request: Request) {
    const token = request.cookies?.[this.sessions.cookieName] as
      string | undefined;
    return this.sessions.getActive(token ?? "");
  }
}
