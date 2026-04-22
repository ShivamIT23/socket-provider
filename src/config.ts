/**
 * ─── Configuration & Logger ───────────────────────────────────
 * Centralized config from environment variables.
 */

import dotenv from "dotenv";
dotenv.config();

export const CFG = {
  PORT:                    Number(process.env.PORT) || 5001,
  MAIN_BACKEND_URL:        process.env.MAIN_BACKEND_URL        || "http://localhost:3002",
  LIVEKIT_API_KEY:         process.env.LIVEKIT_API_KEY         || "",
  LIVEKIT_API_SECRET:      process.env.LIVEKIT_API_SECRET      || "",
  LIVEKIT_WS_URL:          process.env.LIVEKIT_WS_URL          || "",
  TURN_URLS:               (process.env.TURN_URLS || "").split(",").filter(Boolean),
  TURN_USERNAME:           process.env.TURN_USERNAME           || "",
  TURN_CREDENTIAL:         process.env.TURN_CREDENTIAL         || "",
  MAX_CHAT_HISTORY:        200,
  MAX_CHAT_PER_MINUTE:     20,
  ROOM_CLEANUP_DELAY_MS:   10 * 60 * 1000,
  ROOM_STALE_MS:           24 * 60 * 60 * 1000,
  SYNC_INTERVAL_MS:        30 * 1000,
  GC_INTERVAL_MS:          60 * 60 * 1000,
  INTERNAL_SECRET:         process.env.INTERNAL_SECRET || "",
};

export const log = {
  info:  (...a: unknown[]) => console.log ("[INFO]",  ...a),
  warn:  (...a: unknown[]) => console.warn("[WARN]",  ...a),
  error: (...a: unknown[]) => console.error("[ERR]",  ...a),
  debug: (...a: unknown[]) => process.env.DEBUG && console.log("[DBG]", ...a),
};
