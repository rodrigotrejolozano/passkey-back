import { Module } from "@nestjs/common";

import { ChallengesModule } from "../challenges/challenges.module";
import { SessionsModule } from "../sessions/sessions.module";
import { PasskeyService } from "./passkey.service";

@Module({
  imports: [ChallengesModule, SessionsModule],
  providers: [PasskeyService],
  exports: [PasskeyService],
})
export class PasskeysModule {}
