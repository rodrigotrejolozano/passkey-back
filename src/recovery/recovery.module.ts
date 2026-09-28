import { Module } from "@nestjs/common";

import { RandomSource } from "../common/random-source";
import { ChallengesModule } from "../challenges/challenges.module";
import { DatabaseModule } from "../database/database.module";
import { EmailModule } from "../email/email.module";
import { SessionsModule } from "../sessions/sessions.module";
import { RecoveryController } from "./recovery.controller";
import { PublicRecoveryController } from "./public-recovery.controller";
import { RecoveryService } from "./recovery.service";

@Module({
  imports: [DatabaseModule, ChallengesModule, EmailModule, SessionsModule],
  controllers: [RecoveryController, PublicRecoveryController],
  providers: [RandomSource, RecoveryService],
})
export class RecoveryModule {}
