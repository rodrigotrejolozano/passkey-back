import { Module } from "@nestjs/common";

import { GoogleModule } from "../google/google.module";
import { PasskeysModule } from "../passkeys/passkeys.module";
import { RateLimitModule } from "../rate-limit/rate-limit.module";
import { SessionsModule } from "../sessions/sessions.module";
import { AuthController } from "./auth.controller";

@Module({
  imports: [PasskeysModule, SessionsModule, GoogleModule, RateLimitModule],
  controllers: [AuthController],
})
export class AuthModule {}
