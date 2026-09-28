import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";

import { AuthModule } from "../auth/auth.module";
import { AppController } from "./app.controller";
import { ChallengesModule } from "../challenges/challenges.module";
import { DatabaseModule } from "../database/database.module";
import { EmailModule } from "../email/email.module";
import { RateLimitModule } from "../rate-limit/rate-limit.module";
import { RecoveryModule } from "../recovery/recovery.module";
import { SecurityModule } from "../security/security.module";
import { StepUpModule } from "../step-up/step-up.module";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    DatabaseModule,
    ChallengesModule,
    EmailModule,
    RateLimitModule,
    RecoveryModule,
    AuthModule,
    SecurityModule,
    StepUpModule,
  ],
  controllers: [AppController],
})
export class AppModule {}
