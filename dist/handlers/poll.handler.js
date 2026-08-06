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
import { ensureRoom, isTeacherSocket } from "../room.js";
export function registerPollSocketHandlers(socket, io) {
    const broadcastPollState = (roomId, room) => {
        io.to(roomId).emit("poll_update", {
            roomId,
            payload: room.currentPoll || null,
            pollsHistory: room.pollsHistory || [],
        });
    };
    // ── Create or Relaunch poll (teacher only) ──────────────────
    socket.on("poll_create", ({ payload }) => {
        if (!socket.roomId || !isTeacherSocket(socket))
            return;
        const room = ensureRoom(socket.roomId);
        if (!payload.question || !Array.isArray(payload.options) || payload.options.length < 2) {
            socket.emit("error", { message: "Poll requires a question and at least 2 options." });
            return;
        }
        if (!room.pollsHistory)
            room.pollsHistory = [];
        // If current poll is active, mark it inactive
        if (room.currentPoll) {
            room.currentPoll.isActive = false;
        }
        const newPoll = {
            id: crypto.randomUUID(),
            question: payload.question.trim(),
            options: payload.options.map((optText) => ({
                id: crypto.randomUUID(),
                text: optText.trim(),
                votes: [],
            })),
            isActive: true,
            createdAt: Date.now(),
            createdBy: socket.user?.name || "Teacher",
        };
        room.currentPoll = newPoll;
        // Remove any existing history entry with the same question to avoid duplicates
        room.pollsHistory = room.pollsHistory.filter(p => p.question.trim().toLowerCase() !== newPoll.question.trim().toLowerCase());
        room.pollsHistory.unshift(newPoll); // add to beginning of history
        room.isDirty = true;
        broadcastPollState(socket.roomId, room);
    });
    // ── Vote on poll ────────────────────────────────────────────
    socket.on("poll_vote", ({ payload }) => {
        if (!socket.roomId || !socket.userId)
            return;
        const room = ensureRoom(socket.roomId);
        if (!room.currentPoll || !room.currentPoll.isActive) {
            socket.emit("error", { message: "No active poll to vote on." });
            return;
        }
        const voterId = socket.user?.visitorId ? String(socket.user.visitorId) : socket.userId;
        // Check if user has already voted on this poll (single vote rule)
        const hasAlreadyVoted = room.currentPoll.options.some((opt) => opt.votes.includes(voterId));
        if (hasAlreadyVoted) {
            socket.emit("error", { message: "You have already voted on this poll." });
            return;
        }
        // Add vote to chosen option
        const targetOpt = room.currentPoll.options.find((opt) => opt.id === payload.optionId);
        if (targetOpt) {
            targetOpt.votes.push(voterId);
        }
        // Sync in history as well
        if (room.pollsHistory) {
            const histPoll = room.pollsHistory.find(p => p.id === room.currentPoll?.id);
            if (histPoll) {
                const histOpt = histPoll.options.find(o => o.id === payload.optionId);
                if (histOpt && !histOpt.votes.includes(voterId))
                    histOpt.votes.push(voterId);
            }
        }
        room.isDirty = true;
        broadcastPollState(socket.roomId, room);
    });
    // ── End poll (teacher only) ─────────────────────────────────
    socket.on("poll_end", () => {
        if (!socket.roomId || !isTeacherSocket(socket))
            return;
        const room = ensureRoom(socket.roomId);
        if (room.currentPoll && room.currentPoll.isActive) {
            room.currentPoll.isActive = false;
            if (room.pollsHistory) {
                const histPoll = room.pollsHistory.find(p => p.id === room.currentPoll?.id);
                if (histPoll)
                    histPoll.isActive = false;
            }
            room.isDirty = true;
            // Broadcast updated poll status
            broadcastPollState(socket.roomId, room);
            // Post compact poll results in chat for everyone
            const totalVotes = room.currentPoll.options.reduce((sum, o) => sum + o.votes.length, 0);
            const chatResultsMsg = {
                id: crypto.randomUUID(),
                user: { name: "Poll System", isTeacher: true },
                message: `📊 Poll Results: ${room.currentPoll.question}`,
                recipient: "everyone",
                pollResults: {
                    question: room.currentPoll.question,
                    options: room.currentPoll.options.map((o) => ({ text: o.text, votesCount: o.votes.length })),
                    totalVotes,
                },
                timestamp: Date.now(),
            };
            room.chat.push(chatResultsMsg);
            io.to(socket.roomId).emit("chat", { roomId: socket.roomId, payload: chatResultsMsg });
        }
    });
    // ── Delete poll (teacher only) ──────────────────────────────
    socket.on("poll_delete", ({ payload }) => {
        if (!socket.roomId || !isTeacherSocket(socket))
            return;
        const room = ensureRoom(socket.roomId);
        const targetId = payload?.pollId || room.currentPoll?.id;
        if (targetId && room.pollsHistory) {
            room.pollsHistory = room.pollsHistory.filter(p => p.id !== targetId);
        }
        if (!targetId || room.currentPoll?.id === targetId) {
            room.currentPoll = null;
        }
        room.isDirty = true;
        broadcastPollState(socket.roomId, room);
    });
}
//# sourceMappingURL=poll.handler.js.map