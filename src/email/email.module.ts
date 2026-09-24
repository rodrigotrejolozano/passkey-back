import { Module } from "@nestjs/common";

import { EmailProvider } from "./email.provider";
import { SmtpEmailProvider } from "./smtp-email.provider";

@Module({
  providers: [
    SmtpEmailProvider,
    { provide: EmailProvider, useExisting: SmtpEmailProvider },
  ],
  exports: [EmailProvider],
})
export class EmailModule {}
