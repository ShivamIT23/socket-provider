/**
 * ─── Chat Handler ─────────────────────────────────────────────
 * SECTION: Chat & Messaging
 *
 * Features:
 *  - Send/receive messages with rate limiting
 *  - Chat history (last 200 messages)
 *  - Mute/unmute individual users
 *  - Toggle chat on/off globally
 *  - Delete individual messages or clear all
 *  - Typing indicators
 */
import type { Server } from "socket.io";
import type { Application } from "express";
import type { CustomSocket } from "../types.js";
export declare function registerChatSocketHandlers(socket: CustomSocket, io: Server): void;
export declare function registerChatRoutes(app: Application, io: Server): void;
//# sourceMappingURL=chat.handler.d.ts.map