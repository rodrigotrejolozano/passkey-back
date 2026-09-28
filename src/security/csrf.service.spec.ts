import { ForbiddenException, UnauthorizedException } from "@nestjs/common";
import { jest } from "@jest/globals";
import { createHmac } from "node:crypto";

import { CsrfService } from "./csrf.service";

describe("CsrfService", () => {
  type ActiveSession = {
    csrfTokenHash: string | null;
    revokedAt: Date | null;
    idleExpiresAt: Date;
    absoluteExpiresAt: Date;
  };
  type ActiveRecoverySession = {
    csrfTokenHash: string | null;
    consumedAt: Date | null;
    revokedAt: Date | null;
    expiresAt: Date;
  };
  const sessionUpdateMany =
    jest.fn<(input: unknown) => Promise<{ count: number }>>();
  const sessionFindUnique =
    jest.fn<(input: unknown) => Promise<ActiveSession | null>>();
  const recoveryUpdateMany =
    jest.fn<(input: unknown) => Promise<{ count: number }>>();
  const recoveryFindUnique =
    jest.fn<(input: unknown) => Promise<ActiveRecoverySession | null>>();
  const prisma = {
    session: { updateMany: sessionUpdateMany, findUnique: sessionFindUnique },
    recoverySession: {
      updateMany: recoveryUpdateMany,
      findUnique: recoveryFindUnique,
    },
  };
  const random = { token: jest.fn(() => "raw-csrf-token") };
  const config = {
    getOrThrow: jest.fn((key: string) =>
      key === "CSRF_SECRET" ? "csrf-secret" : "session-secret",
    ),
  };
  const service = new CsrfService(
    prisma as never,
    random as never,
    config as never,
  );

  beforeEach(() => jest.clearAllMocks());

  it("stores only the hash when issuing a session token", async () => {
    sessionUpdateMany.mockResolvedValue({ count: 1 });

    await expect(service.issueSessionToken("session-token")).resolves.toBe(
      "raw-csrf-token",
    );
    const data = (
      sessionUpdateMany.mock.calls[0][0] as {
        data: { csrfTokenHash: string };
      }
    ).data;
    expect(data.csrfTokenHash).not.toBe("raw-csrf-token");
    expect(data.csrfTokenHash).toBe(
      createHmac("sha256", "csrf-secret")
        .update("raw-csrf-token")
        .digest("base64url"),
    );
  });

  it("rejects issuing a token for an inactive session", async () => {
    sessionUpdateMany.mockResolvedValue({ count: 0 });
    await expect(service.issueSessionToken("invalid")).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it("accepts the matching token for an active session", async () => {
    sessionFindUnique.mockResolvedValue({
      csrfTokenHash: createHmac("sha256", "csrf-secret")
        .update("presented-token")
        .digest("base64url"),
      revokedAt: null,
      idleExpiresAt: new Date(Date.now() + 60_000),
      absoluteExpiresAt: new Date(Date.now() + 60_000),
    });
    await expect(
      service.requireSessionToken("session-token", "presented-token"),
    ).resolves.toBeUndefined();
  });

  it("rejects a mismatched session token", async () => {
    sessionFindUnique.mockResolvedValue({
      csrfTokenHash: createHmac("sha256", "csrf-secret")
        .update("expected-token")
        .digest("base64url"),
      revokedAt: null,
      idleExpiresAt: new Date(Date.now() + 60_000),
      absoluteExpiresAt: new Date(Date.now() + 60_000),
    });
    await expect(
      service.requireSessionToken("session-token", "wrong-token"),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("keeps recovery CSRF separate from normal sessions", async () => {
    recoveryUpdateMany.mockResolvedValue({ count: 1 });
    recoveryFindUnique.mockResolvedValue({
      csrfTokenHash: createHmac("sha256", "csrf-secret")
        .update("raw-csrf-token")
        .digest("base64url"),
      consumedAt: null,
      revokedAt: null,
      expiresAt: new Date(Date.now() + 60_000),
    });

    const token = await service.issueRecoveryToken("recovery-token");
    await expect(
      service.requireRecoveryToken("recovery-token", token),
    ).resolves.toBeUndefined();
    expect(sessionUpdateMany).not.toHaveBeenCalled();
  });
});
