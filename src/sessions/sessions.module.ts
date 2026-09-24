import { Module } from "@nestjs/common";

import { RandomSource } from "../common/random-source";
import { SessionService } from "./session.service";

@Module({
  providers: [RandomSource, SessionService],
  exports: [SessionService],
})
export class SessionsModule {}
