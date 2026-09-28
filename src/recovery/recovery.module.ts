import { Module } from "@nestjs/common";

import { RandomSource } from "../common/random-source";
import { DatabaseModule } from "../database/database.module";
import { EmailModule } from "../email/email.module";
import { SessionsModule } from "../sessions/sessions.module";
import { RecoveryController } from "./recovery.controller";
import { RecoveryService } from "./recovery.service";

@Module({
  imports: [DatabaseModule, EmailModule, SessionsModule],
  controllers: [RecoveryController],
  providers: [RandomSource, RecoveryService],
})
export class RecoveryModule {}
