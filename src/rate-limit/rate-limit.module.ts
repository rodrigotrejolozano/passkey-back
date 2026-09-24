import { Module } from "@nestjs/common";

import { Clock } from "../common/clock";
import { RateLimitService } from "./rate-limit.service";

@Module({
  providers: [Clock, RateLimitService],
  exports: [RateLimitService],
})
export class RateLimitModule {}
