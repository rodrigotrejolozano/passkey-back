import { jest } from "@jest/globals";

import { OAuthTransactionPurpose } from "../generated/prisma/client";
import { AuthController } from "./auth.controller";

describe("AuthController", () => {
  const complete = jest.fn<(input: unknown) => Promise<unknown>>();
  const getPurpose =
    jest.fn<(state: string) => Promise<OAuthTransactionPurpose>>();
  const controller = new AuthController(
    {} as never,
    { cookieName: "passkey_session" } as never,
    {
      bindingCookieName: jest.fn(() => "passkey_oauth_state"),
      localeCookieName: jest.fn(() => "passkey_oauth_locale_state"),
      complete,
      getPurpose,
    } as never,
    {} as never,
    { assertAllowed: jest.fn(async () => undefined) } as never,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    getPurpose.mockResolvedValue(OAuthTransactionPurpose.LOGIN_OR_SIGNUP);
  });

  it.each([
    [false, "http://localhost:3000/es/home"],
    [true, "http://localhost:3000/es/security/recovery?onboarding=1"],
  ])(
    "redirects a %s Google account directly to its destination",
    async (isNewAccount, destination) => {
      complete.mockResolvedValue({
        token: "session-token",
        isNewAccount,
        purpose: OAuthTransactionPurpose.LOGIN_OR_SIGNUP,
      });
      const response = {
        clearCookie: jest.fn(),
        cookie: jest.fn(),
        redirect: jest.fn(),
      };

      await controller.completeGoogle(
        {
          query: { state: "state", code: "code" },
          cookies: { passkey_oauth_state: "binding-token" },
          ip: "127.0.0.1",
        } as never,
        response as never,
      );

      expect(response.cookie).toHaveBeenCalledWith(
        "passkey_session",
        "session-token",
        expect.any(Object),
      );
      expect(response.redirect).toHaveBeenCalledWith(destination);
    },
  );

  it("returns Google step-up directly to the pending sign-in action", async () => {
    complete.mockResolvedValue({
      token: "session-token",
      isNewAccount: false,
      purpose: OAuthTransactionPurpose.STEP_UP,
    });
    const response = {
      clearCookie: jest.fn(),
      cookie: jest.fn(),
      redirect: jest.fn(),
    };

    await controller.completeGoogle(
      {
        query: { state: "state", code: "code" },
        cookies: {
          passkey_oauth_state: "binding-token",
          passkey_step_up_source: "sign-in",
        },
        ip: "127.0.0.1",
      } as never,
      response as never,
    );

    expect(response.redirect).toHaveBeenCalledWith(
      "http://localhost:3000/es/security/sign-in?stepUp=complete",
    );
  });

  it("keeps the requested English locale after a Google callback", async () => {
    complete.mockResolvedValue({
      token: "session-token",
      isNewAccount: false,
      purpose: OAuthTransactionPurpose.LOGIN_OR_SIGNUP,
    });
    const response = {
      clearCookie: jest.fn(),
      cookie: jest.fn(),
      redirect: jest.fn(),
    };

    await controller.completeGoogle(
      {
        query: { state: "state", code: "code" },
        cookies: {
          passkey_oauth_state: "binding-token",
          passkey_oauth_locale_state: "en",
        },
        ip: "127.0.0.1",
      } as never,
      response as never,
    );

    expect(response.redirect).toHaveBeenCalledWith(
      "http://localhost:3000/en/home",
    );
  });
});
