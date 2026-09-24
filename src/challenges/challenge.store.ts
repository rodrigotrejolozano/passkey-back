import { Prisma, WebAuthnChallenge } from "../generated/prisma/client";

export type CreateChallengeInput = Prisma.WebAuthnChallengeUncheckedCreateInput;

export type ConsumedChallenge = WebAuthnChallenge;

export abstract class ChallengeStore {
  abstract create(input: CreateChallengeInput): Promise<ConsumedChallenge>;
  abstract consume(id: string, now: Date): Promise<ConsumedChallenge | null>;
  abstract deleteExpired(now: Date): Promise<number>;
}
