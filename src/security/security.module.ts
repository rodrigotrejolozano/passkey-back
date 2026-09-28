import { Module } from "@nestjs/common";

import { GoogleModule } from "../google/google.module";
import { PasskeysModule } from "../passkeys/passkeys.module";
import { SessionsModule } from "../sessions/sessions.module";
import { StepUpModule } from "../step-up/step-up.module";
import { SecurityController } from "./security.controller";

@Module({
  imports: [SessionsModule, PasskeysModule, GoogleModule, StepUpModule],
  controllers: [SecurityController],
})
export class SecurityModule {}
