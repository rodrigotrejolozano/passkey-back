import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import nodemailer from "nodemailer";

import { EmailProvider, SendEmailInput } from "./email.provider";

@Injectable()
export class SmtpEmailProvider extends EmailProvider {
  constructor(private readonly config: ConfigService) {
    super();
  }

  async send(input: SendEmailInput): Promise<void> {
    const transporter = nodemailer.createTransport({
      host: this.config.getOrThrow<string>("SMTP_HOST"),
      port: Number(this.config.getOrThrow<string>("SMTP_PORT")),
      secure: Number(this.config.getOrThrow<string>("SMTP_PORT")) === 465,
      auth: this.config.get<string>("SMTP_USERNAME")
        ? {
            user: this.config.getOrThrow<string>("SMTP_USERNAME"),
            pass: this.config.getOrThrow<string>("SMTP_PASSWORD"),
          }
        : undefined,
    });

    await transporter.sendMail({
      from: this.config.getOrThrow<string>("SMTP_FROM"),
      ...input,
    });
  }
}
