import { getEnvironment } from "./environment";

describe("getEnvironment", () => {
  it("uses local development defaults", () => {
    expect(getEnvironment({})).toEqual({
      nodeEnv: "development",
      port: 3001,
      frontendOrigin: "http://localhost:3000",
    });
  });

  it("rejects invalid ports", () => {
    expect(() => getEnvironment({ PORT: "invalid" })).toThrow(
      "PORT must be a valid TCP port.",
    );
  });
});
