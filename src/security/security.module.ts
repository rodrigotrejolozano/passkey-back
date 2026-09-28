import { Module } from "@nestjs/common";

import { GoogleModule } from "../google/google.module";
import { PasskeysModule } from "../passkeys/passkeys.module";
import { SessionsModule } from "../sessions/sessions.module";
import { SecurityController } from "./security.controller";

@Module({
  imports: [SessionsModule, PasskeysModule, GoogleModule],
  controllers: [SecurityController],
})
export class SecurityModule {}
