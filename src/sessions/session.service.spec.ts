import { jest } from "@jest/globals";

import { SessionAuthMethod } from "../generated/prisma/client";
import { SessionService } from "./session.service";

describe("SessionService", () => {
  const create = jest.fn<(input: unknown) => Promise<unknown>>();
  const findUnique = jest.fn<(input: unknown) => Promise<unknown>>();
  const findMany = jest.fn<(input: unknown) => Promise<unknown[]>>();
  const update = jest.fn<(input: unknown) => Promise<unknown>>();
  const updateMany = jest.fn<(input: unknown) => Promise<{ count: number }>>();
  const prisma = {
    session: { create, findUnique, findMany, update, updateMany },
  };
  const random = { token: jest.fn(() => "opaque-session-token") };
  const config = {
    get: jest.fn((key: string) => {
      if (key === "SESSION_IDLE_TIMEOUT_HOURS") return 24;
      if (key === "SESSION_ABSOLUTE_TIMEOUT_DAYS") return 30;
      if (key === "STEP_UP_TTL_MINUTES") return 5;
      return undefined;
    }),
    getOrThrow: jest.fn(() => "session-secret"),
  };
  const service = new SessionService(
    prisma as never,
    random as never,
    config as never,
  );

  beforeEach(() => jest.clearAllMocks());

  it("stores only a hash of an opaque session token", async () => {
    create.mockResolvedValue({});
    await expect(
      service.create("user-1", SessionAuthMethod.PASSKEY),
    ).resolves.toBe("opaque-session-token");
    const input = create.mock.calls[0][0] as {
      data: { tokenHash: string; authMethod: SessionAuthMethod };
    };
    expect(input.data.tokenHash).not.toBe("opaque-session-token");
    expect(input.data.authMethod).toBe(SessionAuthMethod.PASSKEY);
  });

  it.each([
    ["revoked", { revokedAt: new Date() }],
    ["idle expired", { idleExpiresAt: new Date(Date.now() - 1) }],
    ["absolutely expired", { absoluteExpiresAt: new Date(Date.now() - 1) }],
  ])("rejects a %s session", async (_label, override) => {
    findUnique.mockResolvedValue({
      id: "session-1",
      revokedAt: null,
      idleExpiresAt: new Date(Date.now() + 60_000),
      absoluteExpiresAt: new Date(Date.now() + 60_000),
      ...override,
    });
    await expect(service.getActive("token")).rejects.toMatchObject({
      response: { error: { code: "SESSION_INVALID" } },
    });
  });

  it("never renews idle expiry beyond absolute expiry", async () => {
    const absoluteExpiresAt = new Date(Date.now() + 5_000);
    findUnique.mockResolvedValue({
      id: "session-1",
      revokedAt: null,
      idleExpiresAt: new Date(Date.now() + 1_000),
      absoluteExpiresAt,
    });
    update.mockResolvedValue({});
    await service.getActive("token");
    const input = update.mock.calls[0][0] as {
      data: { idleExpiresAt: Date };
    };
    expect(input.data.idleExpiresAt.getTime()).toBe(
      absoluteExpiresAt.getTime(),
    );
  });

  it("lists only active sessions", async () => {
    findMany.mockResolvedValue([]);
    await service.list("user-1");
    const input = findMany.mock.calls[0][0] as {
      where: Record<string, unknown>;
    };
    expect(input.where).toMatchObject({
      userId: "user-1",
      revokedAt: null,
      idleExpiresAt: { gt: expect.any(Date) },
      absoluteExpiresAt: { gt: expect.any(Date) },
    });
  });

  it("requires an unexpired step-up window", async () => {
    findUnique.mockResolvedValue({
      stepUpExpiresAt: new Date(Date.now() - 1),
    });
    await expect(service.requireStepUp("session-1")).rejects.toMatchObject({
      response: { error: { code: "STEP_UP_REQUIRED" } },
    });
  });
});
