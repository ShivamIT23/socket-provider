/**
 * ─── Room State Management ────────────────────────────────────
 * Room CRUD, page helpers, CRDT element merging.
 * This is the shared "database" layer all handlers use.
 */

import type { Room, Page, ExcalidrawElement, RoomStore, CustomSocket } from "./types.js";

// ─── Singleton room store ─────────────────────────────────────

export const rooms: RoomStore = new Map();

// ─── Page factory ─────────────────────────────────────────────

export function createPage(id?: string): Page {
  return {
    id: id ?? `page-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    elements: new Map(),
    backgroundColor: "#ffffff",
    appState: null,
  };
}

// ─── Room factory / getter ────────────────────────────────────

export function ensureRoom(roomId: string): Room {
  if (!rooms.has(roomId)) {
    const page = createPage();
    rooms.set(roomId, {
      id: roomId,
      ownerUserId: null, teacherSocketId: null, counsellorSocketId: null,
      pages: [page], currentPageId: page.id,
      participants: new Map(),
      chat: [],
      mutedUserIds: new Set(),
      textDisabledUserIds: new Set(),
      textEnabledUserIds: new Set(),
      attachmentsDisabledUserIds: new Set(),
      attachmentsEnabledUserIds: new Set(),
      isLocked: false,
      isFrozen: false,
      settings: {
        chatEnabled: true,
        attachmentsEnabled: true,
        drawingEnabled: true,
        videoEnabled: true,
        screenShareLimit: 4,
      },
      isViewportSynced: false, isViewportLocked: false, lastViewport: null,
      duration: null, startTime: null, timerStarted: false, timerInterval: null,
      lastActivity: Date.now(), cleanupTimer: null, isDirty: false,
      lastChatSyncTime: Date.now(),
      chatCountSinceLastSync: 0,
      boardFiles: [],
      boardObjects: [],
    });

    // No longer loading historical chats into memory here
    // History is now fetched directly by the client using server actions
  }
  const room = rooms.get(roomId)!;
  room.lastActivity = Date.now();
  return room;
}

// ─── Page helpers ─────────────────────────────────────────────

export function getPage(room: Room, pageId: string | null): Page {
  const id = pageId ?? room.currentPageId;
  let page = room.pages.find(p => p.id === id);
  if (!page) {
    page = createPage(id ?? undefined);
    room.pages.push(page);
    if (!room.currentPageId) room.currentPageId = page.id;
  }
  return page;
}

// ─── CRDT merge — only accept element if version is newer ─────

export function mergeElements(page: Page, incoming: ExcalidrawElement[]): ExcalidrawElement[] {
  const accepted: ExcalidrawElement[] = [];
  for (const el of incoming) {
    const existing = page.elements.get(el.id);
    if (!existing || el.version > existing.version) {
      page.elements.set(el.id, el);
      accepted.push(el);
    }
  }
  return accepted;
}

// ─── Snapshot serializer ──────────────────────────────────────

export function pageSnapshot(page: Page) {
  return {
    pageId: page.id,
    elements: Array.from(page.elements.values()),
    backgroundColor: page.backgroundColor,
    appState: page.appState,
  };
}

// ─── Auth helpers ─────────────────────────────────────────────

export function isTeacherByUserId(room: Room, userId?: string) {
  return !!(userId && room.ownerUserId === userId);
}

export function isTeacherSocket(socket: CustomSocket) {
  if (!socket.roomId || !socket.userId) return false;
  const room = rooms.get(socket.roomId);
  return !!room && isTeacherByUserId(room, socket.userId);
}

export function isTeacherAuth(roomId: string, userId: string) {
  const room = rooms.get(roomId);
  return !!(room && room.ownerUserId === userId);
}
