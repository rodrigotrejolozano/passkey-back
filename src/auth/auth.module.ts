import { Module } from "@nestjs/common";

import { PasskeysModule } from "../passkeys/passkeys.module";
import { SessionsModule } from "../sessions/sessions.module";
import { AuthController } from "./auth.controller";

@Module({
  imports: [PasskeysModule, SessionsModule],
  controllers: [AuthController],
})
export class AuthModule {}
