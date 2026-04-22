/**
 * ═══════════════════════════════════════════════════════════════
 * TutorArc Collaboration Server — Entry Point
 * ═══════════════════════════════════════════════════════════════
 *
 * This file just WIRES the modular handlers together.
 * All feature logic lives in its own handler file:
 *
 *   handlers/
 *   ├── auth.handler.ts       → Join, disconnect, user verification
 *   ├── chat.handler.ts       → Messaging, mute, rate limiting
 *   ├── drawing.handler.ts    → Excalidraw CRDT sync, pointer
 *   ├── viewport.handler.ts   → Follow-me, lock, fit-to-content
 *   ├── controls.handler.ts   → Lock, freeze, pages, timer, end session
 *   └── video.handler.ts      → LiveKit token, media state, ICE
 *
 *   services/
 *   ├── timer.service.ts      → Room countdown timer
 *   └── sync.service.ts       → Backend sync, GC, graceful shutdown
 */
export {};
//# sourceMappingURL=index.d.ts.map