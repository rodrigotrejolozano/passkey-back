import { HttpException, HttpStatus, Injectable } from "@nestjs/common";

import { Clock } from "../common/clock";
import { PrismaService } from "../database/prisma.service";

@Injectable()
export class RateLimitService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: Clock,
  ) {}

  async assertAllowed(
    scope: string,
    key: string,
    limit: number,
    windowSeconds: number,
  ): Promise<void> {
    const now = this.clock.now();
    const windowStart = new Date(now.getTime() - windowSeconds * 1000);

    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        await this.prisma.$transaction(
          async (transaction) => {
            await transaction.rateLimitAttempt.deleteMany({
              where: { createdAt: { lte: windowStart } },
            });
            const attempts = await transaction.rateLimitAttempt.count({
              where: { scope, key, createdAt: { gt: windowStart } },
            });

            if (attempts >= limit) {
              throw new HttpException(
                {
                  error: {
                    code: "RATE_LIMITED",
                    message: "Too many requests. Try again later.",
                  },
                },
                HttpStatus.TOO_MANY_REQUESTS,
              );
            }

            await transaction.rateLimitAttempt.create({ data: { scope, key } });
          },
          { isolationLevel: "Serializable" },
        );
        return;
      } catch (error) {
        if ((error as { code?: string }).code !== "P2034" || attempt === 2)
          throw error;
      }
    }
  }
}
