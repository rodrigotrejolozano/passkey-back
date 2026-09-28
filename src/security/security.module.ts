import { Module } from "@nestjs/common";

import { SessionsModule } from "../sessions/sessions.module";
import { SecurityController } from "./security.controller";

@Module({ imports: [SessionsModule], controllers: [SecurityController] })
export class SecurityModule {}
