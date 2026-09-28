import { Global, Module } from "@nestjs/common";

import { RandomSource } from "../common/random-source";
import { RecoveryCsrfGuard, SessionCsrfGuard } from "./csrf.guard";
import { CsrfService } from "./csrf.service";

@Global()
@Module({
  providers: [RandomSource, CsrfService, SessionCsrfGuard, RecoveryCsrfGuard],
  exports: [CsrfService, SessionCsrfGuard, RecoveryCsrfGuard],
})
export class CsrfModule {}
