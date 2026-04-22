/**
 * ─── Room State Management ────────────────────────────────────
 * Room CRUD, page helpers, CRDT element merging.
 * This is the shared "database" layer all handlers use.
 */
import type { Room, Page, ExcalidrawElement, RoomStore, CustomSocket } from "./types.js";
export declare const rooms: RoomStore;
export declare function createPage(id?: string): Page;
export declare function ensureRoom(roomId: string): Room;
export declare function getPage(room: Room, pageId: string | null): Page;
export declare function mergeElements(page: Page, incoming: ExcalidrawElement[]): ExcalidrawElement[];
export declare function pageSnapshot(page: Page): {
    pageId: string;
    elements: ExcalidrawElement[];
    backgroundColor: string;
    appState: Record<string, unknown> | null;
};
export declare function isTeacherByUserId(room: Room, userId?: string): boolean;
export declare function isTeacherSocket(socket: CustomSocket): boolean;
export declare function isTeacherAuth(roomId: string, userId: string): boolean;
//# sourceMappingURL=room.d.ts.map