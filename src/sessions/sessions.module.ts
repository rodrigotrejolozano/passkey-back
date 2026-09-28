import { Module } from "@nestjs/common";

import { RandomSource } from "../common/random-source";
import { SessionsController } from "./sessions.controller";
import { SessionGuard } from "./session.guard";
import { SessionService } from "./session.service";

@Module({
  providers: [RandomSource, SessionService, SessionGuard],
  controllers: [SessionsController],
  exports: [SessionService, SessionGuard],
})
export class SessionsModule {}
