import { CanActivate, ExecutionContext, Injectable } from "@nestjs/common";
import type { Request } from "express";

import { CsrfService } from "./csrf.service";

function header(request: Request): string {
  const value = request.headers["x-csrf-token"];
  return typeof value === "string" ? value : "";
}

@Injectable()
export class SessionCsrfGuard implements CanActivate {
  constructor(private readonly csrf: CsrfService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    if (["GET", "HEAD", "OPTIONS"].includes(request.method)) return true;
    const sessionToken =
      (request.cookies?.passkey_session as string | undefined) ?? "";
    await this.csrf.requireSessionToken(sessionToken, header(request));
    return true;
  }
}

@Injectable()
export class RecoveryCsrfGuard implements CanActivate {
  constructor(private readonly csrf: CsrfService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    if (["GET", "HEAD", "OPTIONS"].includes(request.method)) return true;
    const recoveryToken =
      (request.cookies?.passkey_recovery as string | undefined) ?? "";
    await this.csrf.requireRecoveryToken(recoveryToken, header(request));
    return true;
  }
}
