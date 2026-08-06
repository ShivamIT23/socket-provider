/**
 * ─── Poll Handler ─────────────────────────────────────────────
 * SECTION: Interactive Polls
 *
 * Features:
 *  - Teacher create & launch polls
 *  - Student voting with real-time tally
 *  - Teacher end or clear polls
 *  - Automatic state broadcast
 */
import type { Server } from "socket.io";
import type { CustomSocket } from "../types.js";
export declare function registerPollSocketHandlers(socket: CustomSocket, io: Server): void;
//# sourceMappingURL=poll.handler.d.ts.map