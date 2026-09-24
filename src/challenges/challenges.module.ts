import { Module } from "@nestjs/common";

import { ChallengeStore } from "./challenge.store";
import { PostgresChallengeStore } from "./postgres-challenge.store";

@Module({
  providers: [
    PostgresChallengeStore,
    { provide: ChallengeStore, useExisting: PostgresChallengeStore },
  ],
  exports: [ChallengeStore],
})
export class ChallengesModule {}
