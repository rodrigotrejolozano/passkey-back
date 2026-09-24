import { Module } from "@nestjs/common";

import { RandomSource } from "../common/random-source";
import { SessionsModule } from "../sessions/sessions.module";
import { GoogleService } from "./google.service";

@Module({
  imports: [SessionsModule],
  providers: [RandomSource, GoogleService],
  exports: [GoogleService],
})
export class GoogleModule {}
