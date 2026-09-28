import { getEnvironment } from "./environment";

describe("getEnvironment", () => {
  it("uses local development defaults", () => {
    expect(getEnvironment({})).toEqual({
      nodeEnv: "development",
      port: 3001,
      frontendOrigin: "http://localhost:3000",
      backendOrigin: "http://localhost:3001",
    });
  });

  it("requires HTTPS origins in production", () => {
    expect(() =>
      getEnvironment({
        NODE_ENV: "production",
        FRONTEND_ORIGIN: "http://app.example.test",
        BACKEND_ORIGIN: "https://api.example.test",
      }),
    ).toThrow("Production origins must use HTTPS.");
  });

  it("rejects invalid ports", () => {
    expect(() => getEnvironment({ PORT: "invalid" })).toThrow(
      "PORT must be a valid TCP port.",
    );
  });
});
