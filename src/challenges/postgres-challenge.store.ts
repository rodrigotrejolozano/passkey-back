import { Injectable } from "@nestjs/common";

import { PrismaService } from "../database/prisma.service";
import {
  ChallengeStore,
  ConsumedChallenge,
  CreateChallengeInput,
} from "./challenge.store";

@Injectable()
export class PostgresChallengeStore extends ChallengeStore {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async create(input: CreateChallengeInput): Promise<ConsumedChallenge> {
    return this.prisma.webAuthnChallenge.create({ data: input });
  }

  async consume(id: string, now: Date): Promise<ConsumedChallenge | null> {
    const consumed = await this.prisma.webAuthnChallenge.updateMany({
      where: {
        id,
        expiresAt: { gt: now },
        consumedAt: null,
      },
      data: { consumedAt: now },
    });

    if (consumed.count === 0) {
      return null;
    }

    return this.prisma.webAuthnChallenge.findUnique({ where: { id } });
  }

  async deleteExpired(now: Date): Promise<number> {
    const result = await this.prisma.webAuthnChallenge.deleteMany({
      where: { expiresAt: { lte: now } },
    });

    return result.count;
  }
}
