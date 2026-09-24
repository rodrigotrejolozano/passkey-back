import { Injectable } from "@nestjs/common";
import { randomBytes } from "node:crypto";

@Injectable()
export class RandomSource {
  token(byteLength = 32): string {
    return randomBytes(byteLength).toString("base64url");
  }
}
