import { CanActivate, ExecutionContext, Injectable } from "@nestjs/common";
import type { Request } from "express";

import { SessionService } from "../sessions/session.service";

@Injectable()
export class StepUpGuard implements CanActivate {
  constructor(private readonly sessions: SessionService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const token =
      (request.cookies?.[this.sessions.cookieName] as string | undefined) ?? "";
    const session = await this.sessions.getActive(token);
    await this.sessions.requireStepUp(session.id);
    return true;
  }
}
