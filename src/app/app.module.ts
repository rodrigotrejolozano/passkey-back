import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";

import { AuthModule } from "../auth/auth.module";
import { AppController } from "./app.controller";
import { ChallengesModule } from "../challenges/challenges.module";
import { DatabaseModule } from "../database/database.module";
import { EmailModule } from "../email/email.module";
import { RateLimitModule } from "../rate-limit/rate-limit.module";
import { SecurityModule } from "../security/security.module";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    DatabaseModule,
    ChallengesModule,
    EmailModule,
    RateLimitModule,
    AuthModule,
    SecurityModule,
  ],
  controllers: [AppController],
})
export class AppModule {}
