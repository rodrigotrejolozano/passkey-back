import { CanActivate, ExecutionContext, Injectable } from "@nestjs/common";
import type { Request } from "express";

import { SessionService } from "./session.service";

@Injectable()
export class SessionGuard implements CanActivate {
  constructor(private readonly sessions: SessionService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const token =
      (request.cookies?.[this.sessions.cookieName] as string | undefined) ?? "";
    await this.sessions.getActive(token);
    return true;
  }
}
