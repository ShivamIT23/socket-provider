/**
 * ─── Shared Types ─────────────────────────────────────────────
 * All interfaces used across server modules.
 * No runtime logic — pure type definitions.
 */

import type { Socket } from "socket.io";

// ─── User & Participants ──────────────────────────────────────

export interface User {
  id: string;
  name: string;
  isTeacher: boolean;
  isCounsellor?: boolean | undefined;
  usertype?: string | undefined;
  visitorId?: number | undefined;
}

export interface Participant {
  user: User;
  socketId: string;
  mediaState: { audio: boolean; video: boolean };
  pointer: { x: number; y: number; tool?: string } | null;
  joinedAt: number;
}

// ─── Excalidraw ───────────────────────────────────────────────

export interface ExcalidrawElement {
  id: string;
  version: number;
  isDeleted?: boolean;
  [key: string]: any;
}

export interface ViewportState {
  scrollX: number;
  scrollY: number;
  zoom: { value: number };
}

// ─── Page & Room ──────────────────────────────────────────────

export interface Page {
  id: string;
  elements: Map<string, ExcalidrawElement>;
  backgroundColor: string;
  appState: Record<string, any> | null;
}

export interface Attachment {
  id: string;
  type: "image" | "file";
  url: string;
  name: string;
  size?: number;
}

export interface ChatMessage {
  id: string;
  user: { name: string; isTeacher: boolean };
  message: string;
  attachments?: Attachment[];
  timestamp: number;
}

export interface Room {
  id: string;
  ownerUserId:        string | null;
  teacherSocketId:    string | null;
  counsellorSocketId: string | null;
  pages:              Page[];
  currentPageId:      string | null;
  participants:       Map<string, Participant>;
  chat:               ChatMessage[];
  isLocked:           boolean;
  isFrozen:           boolean;
  // feature toggles
  settings: {
    chatEnabled:      boolean;
    attachmentsEnabled: boolean;
    drawingEnabled:   boolean;
    videoEnabled:     boolean;
    screenShareLimit: number;
  };
  mutedUserIds:       Set<string>;
  textDisabledUserIds: Set<string>;
  attachmentsDisabledUserIds: Set<string>;
  // viewport
  isViewportSynced:   boolean;
  isViewportLocked:   boolean;
  lastViewport:       ViewportState | null;
  // timer
  duration:           number | null;
  startTime:          number | null;
  timerStarted:       boolean;
  timerInterval:      NodeJS.Timeout | null;
  // meta
  lastActivity:       number;
  cleanupTimer:       NodeJS.Timeout | null;
  isDirty:            boolean;
  lastChatSyncTime:   number;
  chatCountSinceLastSync: number;
}

// ─── Custom Socket ────────────────────────────────────────────

export interface CustomSocket extends Socket {
  roomId?: string;
  userId?: string;
  user?: User;
  chatRate?: { count: number; lastReset: number };
}

// ─── Room store alias ─────────────────────────────────────────

export type RoomStore = Map<string, Room>;
