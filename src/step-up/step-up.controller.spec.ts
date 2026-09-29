import { jest } from "@jest/globals";

import { StepUpController } from "./step-up.controller";

describe("StepUpController", () => {
  it("returns only the verification methods linked to the current user", async () => {
    const sessions = {
      cookieName: "passkey_session",
      getActive: jest.fn(async () => ({ id: "session-1", userId: "user-1" })),
    };
    const prisma = {
      passkeyCredential: { count: jest.fn(async () => 0) },
      externalIdentity: { count: jest.fn(async () => 1) },
    };
    const controller = new StepUpController(
      {} as never,
      sessions as never,
      prisma as never,
    );

    await expect(
      controller.methods({ cookies: { passkey_session: "token" } } as never),
    ).resolves.toEqual({ data: { passkey: false, google: true } });
  });
});
