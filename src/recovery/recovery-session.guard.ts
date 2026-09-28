import { CanActivate, ExecutionContext, Injectable } from "@nestjs/common";
import type { Request } from "express";

import { RecoveryService } from "./recovery.service";

@Injectable()
export class RecoverySessionGuard implements CanActivate {
  constructor(private readonly recovery: RecoveryService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const token =
      (request.cookies?.passkey_recovery as string | undefined) ?? "";
    await this.recovery.getActiveRecoverySession(token);
    return true;
  }
}
