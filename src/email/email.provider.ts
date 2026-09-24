export type SendEmailInput = {
  to: string;
  subject: string;
  text: string;
  html?: string;
};

export abstract class EmailProvider {
  abstract send(input: SendEmailInput): Promise<void>;
}
