/**
 * ─── Auth Handler ─────────────────────────────────────────────
 * SECTION: Core Connection
 *
 * Handles socket join (with backend verification) and disconnect.
 * This is the "plumbing" — every other handler depends on this
 * having run first to set socket.roomId / socket.user.
 */
import type { Server } from "socket.io";
import type { Application } from "express";
import type { CustomSocket } from "../types.js";
declare function broadcastRoomUsers(roomId: string, io: Server): Promise<{
    roomId: string;
    payload: {
        count: number;
        hasTeacher: boolean;
        users: {
            user_id: string;
            username: string;
            socket_id: string;
            isMuted: boolean;
            textEnabled: boolean;
            attachmentsEnabled: boolean;
            drawingEnabled: boolean;
            mediaState: {
                audio: boolean;
                video: boolean;
            };
            role: string;
            isTeacher: boolean;
        }[];
    };
} | undefined>;
export { broadcastRoomUsers };
export declare function registerAuthSocketHandlers(socket: CustomSocket, io: Server): void;
export declare function registerAuthRoutes(app: Application): void;
//# sourceMappingURL=auth.handler.d.ts.map