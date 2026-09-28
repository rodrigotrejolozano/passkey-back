import { Global, Module } from "@nestjs/common";

import { RecoveryCsrfGuard, SessionCsrfGuard } from "./csrf.guard";
import { CsrfService } from "./csrf.service";

@Global()
@Module({
  providers: [CsrfService, SessionCsrfGuard, RecoveryCsrfGuard],
  exports: [CsrfService, SessionCsrfGuard, RecoveryCsrfGuard],
})
export class CsrfModule {}
