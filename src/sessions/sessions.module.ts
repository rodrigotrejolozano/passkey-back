import { Module } from "@nestjs/common";

import { RandomSource } from "../common/random-source";
import { SessionsController } from "./sessions.controller";
import { SessionService } from "./session.service";

@Module({
  providers: [RandomSource, SessionService],
  controllers: [SessionsController],
  exports: [SessionService],
})
export class SessionsModule {}
