import { Module } from "@nestjs/common";

import { PasskeysModule } from "../passkeys/passkeys.module";
import { SessionsModule } from "../sessions/sessions.module";
import { StepUpController } from "./step-up.controller";

@Module({
  imports: [PasskeysModule, SessionsModule],
  controllers: [StepUpController],
})
export class StepUpModule {}
