/**
 * ─── Timer Service ────────────────────────────────────────────
 * Manages room countdown timers (start, stop, tick → broadcast).
 */
import type { Server } from "socket.io";
export declare function startRoomTimer(roomId: string, io: Server): void;
export declare function stopRoomTimer(roomId: string): void;
//# sourceMappingURL=timer.service.d.ts.map