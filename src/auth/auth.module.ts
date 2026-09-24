import { Module } from "@nestjs/common";

import { GoogleModule } from "../google/google.module";
import { PasskeysModule } from "../passkeys/passkeys.module";
import { SessionsModule } from "../sessions/sessions.module";
import { AuthController } from "./auth.controller";

@Module({
  imports: [PasskeysModule, SessionsModule, GoogleModule],
  controllers: [AuthController],
})
export class AuthModule {}
