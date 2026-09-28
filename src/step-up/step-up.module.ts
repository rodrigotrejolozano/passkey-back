import { Module } from "@nestjs/common";

import { GoogleModule } from "../google/google.module";
import { PasskeysModule } from "../passkeys/passkeys.module";
import { SessionsModule } from "../sessions/sessions.module";
import { GoogleStepUpController } from "./google-step-up.controller";
import { StepUpController } from "./step-up.controller";
import { StepUpGuard } from "./step-up.guard";

@Module({
  imports: [PasskeysModule, SessionsModule, GoogleModule],
  controllers: [StepUpController, GoogleStepUpController],
  providers: [StepUpGuard],
  exports: [StepUpGuard],
})
export class StepUpModule {}
