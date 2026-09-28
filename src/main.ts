import { ValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import cookieParser from "cookie-parser";
import type { NextFunction, Request, Response } from "express";
import helmet from "helmet";

import { AppModule } from "./app/app.module";
import { getEnvironment } from "./config/environment";

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bodyParser: true });
  const environment = getEnvironment();

  app.setGlobalPrefix("api");
  app.use(helmet());
  app.use((request: Request, response: Response, next: NextFunction) => {
    if (
      /^\/api\/(auth|security|sessions|step-up|recovery)(\/|$)/.test(
        request.path,
      )
    ) {
      response.setHeader("Cache-Control", "no-store, private");
    }
    next();
  });
  app.use(cookieParser());
  if (environment.nodeEnv === "production") {
    app.getHttpAdapter().getInstance().set("trust proxy", 1);
  }
  app.enableCors({
    origin: environment.frontendOrigin,
    credentials: true,
  });
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
    }),
  );

  await app.listen(environment.port);
}

void bootstrap();
