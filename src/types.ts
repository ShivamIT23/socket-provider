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
  approvalStatus?: 'pending' | 'approved' | 'rejected' | undefined;
}

export interface Participant {
  user: User;
  socketId: string;
  mediaState: { audio: boolean; video: boolean };
  pointer: { x: number; y: number; tool?: string } | null;
  joinedAt: number;
  approvalStatus: 'pending' | 'approved' | 'rejected';
}

// ─── Excalidraw ───────────────────────────────────────────────

export interface ExcalidrawElement {
  id: string;
  version: number;
  isDeleted?: boolean;
  [key: string]: unknown;
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
  appState: Record<string, unknown> | null;
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
  user: { name: string; isTeacher: boolean; visitorId?: number | undefined; id?: string };
  senderId?: string;
  recipient?: "everyone" | "teacher";
  message: string;
  attachments?: Attachment[];
  pollResults?: {
    question: string;
    options: { text: string; votesCount: number }[];
    totalVotes: number;
  };
  quizShare?: {
    shareToken: string;
    quizTitle: string;
  };
  timestamp: number;
}

export interface PollOption {
  id: string;
  text: string;
  votes: string[]; // array of userIds or visitorIds
}

export interface Poll {
  id: string;
  question: string;
  options: PollOption[];
  isActive: boolean;
  createdAt: number;
  createdBy: string;
}

export interface QuizOption {
  id: string;
  text: string;
  votes: string[]; // userIds or visitorIds
}

export interface QuizQuestion {
  id: string;
  question: string;
  options: QuizOption[];
  correctOption: number; // 0-based index
}

export interface QuizState {
  id: string;
  questions: QuizQuestion[];
  isActive: boolean;
  createdAt: number;
  submittedUsers: string[];
}

export interface BoardFile {
  id: string;
  url: string;       // base64 data URL
  name: string;
  position: { x: number; y: number };  // normalized 0-1
  scale: number;     // normalized relative to canvas width
  widthRatio?: number;
  heightRatio?: number;
  addedBy: string;   // user name
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
  currentPoll?:       Poll | null;
  pollsHistory?:      Poll[];
  currentQuiz?:       QuizState | null;
  // feature toggles
  settings: {
    chatEnabled:      boolean;
    attachmentsEnabled: boolean;
    drawingEnabled:   boolean;
    videoEnabled:     boolean;
    screenShareLimit: number;
    isAutoApprove:    boolean;
    maxStudents:      number;
  };
  mutedUserIds:       Set<string>;
  textDisabledUserIds: Set<string>;
  textEnabledUserIds: Set<string>;
  attachmentsDisabledUserIds: Set<string>;
  attachmentsEnabledUserIds: Set<string>;
  drawingEnabledUserIds: Set<string>;
  drawingDisabledUserIds: Set<string>;
  // viewport
  isViewportSynced:   boolean;
  isViewLocked : boolean;
  isViewportLocked:   boolean;
  lastViewport:       ViewportState | null;
  // timer
  duration:           number | null;
  startTime:          number | null;
  timerStarted:       boolean;
  timerInterval:      NodeJS.Timeout | null;
  // meta
  lastActivity:       number;
  // ts-
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  boardObjects:       Array<{ type: string; payload: Record<string, any>; timestamp: number }>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  redoObjects:        Array<{ type: string; payload: Record<string, any>; timestamp: number }>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  strokeBuffers:      Map<string, Record<string, any>>;
  isDirty:            boolean;
  lastChatSyncTime:   number;
  chatCountSinceLastSync: number;
  boardCountSinceLastSync: number;
  nextAllowedSyncTime: number;
  syncErrorCount: number;
  isLocked:true;
  isFrozen:true;
  // board files (in-memory, like chat)
  boardFiles:         BoardFile[];
  cleanupTimer:       NodeJS.Timeout | null;
  youtubeState?: {
    videoId: string;
    playStatus: "playing" | "paused";
    currentTime: number;
    lastUpdated: number;
  };
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
