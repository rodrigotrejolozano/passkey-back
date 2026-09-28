export type Environment = {
  nodeEnv: "development" | "test" | "production";
  port: number;
  frontendOrigin: string;
  backendOrigin: string;
};

const allowedNodeEnvironments = new Set(["development", "test", "production"]);

export function getEnvironment(
  environment: NodeJS.ProcessEnv = process.env,
): Environment {
  const nodeEnv = environment.NODE_ENV ?? "development";
  const port = Number(environment.PORT ?? "3001");
  const frontendOrigin = environment.FRONTEND_ORIGIN ?? "http://localhost:3000";
  const backendOrigin = environment.BACKEND_ORIGIN ?? "http://localhost:3001";

  if (!allowedNodeEnvironments.has(nodeEnv)) {
    throw new Error("NODE_ENV must be development, test, or production.");
  }

  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("PORT must be a valid TCP port.");
  }

  try {
    new URL(frontendOrigin);
    new URL(backendOrigin);
  } catch {
    throw new Error("FRONTEND_ORIGIN and BACKEND_ORIGIN must be valid URLs.");
  }

  if (
    nodeEnv === "production" &&
    (!frontendOrigin.startsWith("https://") ||
      !backendOrigin.startsWith("https://"))
  ) {
    throw new Error("Production origins must use HTTPS.");
  }

  return {
    nodeEnv: nodeEnv as Environment["nodeEnv"],
    port,
    frontendOrigin,
    backendOrigin,
  };
}
