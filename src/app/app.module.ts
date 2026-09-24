import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";

import { AppController } from "./app.controller";
import { ChallengesModule } from "../challenges/challenges.module";
import { DatabaseModule } from "../database/database.module";
import { EmailModule } from "../email/email.module";
import { RateLimitModule } from "../rate-limit/rate-limit.module";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    DatabaseModule,
    ChallengesModule,
    EmailModule,
    RateLimitModule,
  ],
  controllers: [AppController],
})
export class AppModule {}
