// server/server.js
import http from "node:http";
import { Server } from "socket.io";
import { randomUUID } from "node:crypto";

/**
 * Tic-Tac-Toe – Socket.IO Realtime-Server
 * - Rooms mit Sitzplätzen (X, O) + Spectators
 * - Events: create, join, rename, move, restart
 * - Notifications: joined, left
 * - Zugsvalidierung: Nur aktiver Sitz darf setzen
 */

const PORT = process.env.PORT || 3001;

// --- Gewinn-Kombinationen (wie im Frontend) ---
const WINNING_COMBINATIONS = [
  [
    { row: 0, column: 0 },
    { row: 0, column: 1 },
    { row: 0, column: 2 },
  ],
  [
    { row: 1, column: 0 },
    { row: 1, column: 1 },
    { row: 1, column: 2 },
  ],
  [
    { row: 2, column: 0 },
    { row: 2, column: 1 },
    { row: 2, column: 2 },
  ],
  [
    { row: 0, column: 0 },
    { row: 1, column: 0 },
    { row: 2, column: 0 },
  ],
  [
    { row: 0, column: 1 },
    { row: 1, column: 1 },
    { row: 2, column: 1 },
  ],
  [
    { row: 0, column: 2 },
    { row: 1, column: 2 },
    { row: 2, column: 2 },
  ],
  [
    { row: 0, column: 0 },
    { row: 1, column: 1 },
    { row: 2, column: 2 },
  ],
  [
    { row: 0, column: 2 },
    { row: 1, column: 1 },
    { row: 2, column: 0 },
  ],
];

// --- Raumzustand ---
const initState = () => ({
  board: [
    [null, null, null],
    [null, null, null],
    [null, null, null],
  ],
  turns: [],
  players: { X: "Spieler 1", O: "Spieler 2" },
  active: "X",
  winner: null,
  seats: { X: null, O: null }, // socket.id der Sitzenden
});

const rooms = new Map(); // roomId -> state

// --- Server & Socket.IO ---
const server = http.createServer();
const io = new Server(server, {
  cors: {
    // Für Produktion: Domains hier einschränken (Frontend-URL eintragen)
    origin: ["http://localhost:5173", "https://tic-tac-toe-react-1.onrender.com"],
  },
});

// Hilfen
function computeWinner(board, players) {
  for (const combo of WINNING_COMBINATIONS) {
    const a = board[combo[0].row][combo[0].column];
    const b = board[combo[1].row][combo[1].column];
    const c = board[combo[2].row][combo[2].column];
    if (a && a === b && a === c) return players[a];
  }
  return null;
}

function isDraw(state) {
  // Draw: 9 Züge, kein Gewinner
  return state.turns.length === 9 && !state.winner;
}

io.on("connection", (socket) => {
  // Für disconnect-Handling merken wir Raum & Rolle
  socket.data.roomId = null;
  socket.data.role = "spectator"; // 'X' | 'O' | 'spectator'

  // --- Raum erstellen -> Creator ist X ---
  socket.on("create", (cb) => {
    const roomId = randomUUID();
    const state = initState();
    state.seats.X = socket.id;

    rooms.set(roomId, state);
    socket.join(roomId);
    socket.data.roomId = roomId;
    socket.data.role = "X";

    cb?.({ roomId, symbol: "X" });
  });

  // --- Raum beitreten -> O wenn frei, sonst Zuschauer ---
  socket.on("join", ({ roomId }, cb) => {
    const state = rooms.get(roomId);
    if (!state) return cb?.({ error: "Room not found" });

    socket.join(roomId);
    socket.data.roomId = roomId;

    let role = "spectator";
    if (!state.seats.O) {
      state.seats.O = socket.id;
      role = "O";
    } else if (!state.seats.X) {
      // Falls X frei wäre (z. B. Host hat geschlossen) → X belegen
      state.seats.X = socket.id;
      role = "X";
    }

    socket.data.role = role;

    cb?.({ roomId, symbol: role === "spectator" ? null : role });

    // Allen anderen im Raum Bescheid geben
    socket.to(roomId).emit("joined", { roomId, role });

    // Aktuellen Zustand an alle
    io.to(roomId).emit("state", state);
  });

  // --- Namen ändern (nur eigene Rolle darf eigenen Namen ändern) ---
  socket.on("rename", ({ roomId, symbol, name }) => {
    const state = rooms.get(roomId);
    if (!state) return;

    // Nur Besitzer des Sitzes darf ändern
    if (state.seats[symbol] !== socket.id) return;

    state.players[symbol] = String(name || "").slice(0, 20);
    io.to(roomId).emit("state", state);
  });

  // --- Zug ausführen (nur der aktive Sitz darf setzen) ---
  socket.on("move", ({ roomId, row, col }) => {
    const state = rooms.get(roomId);
    if (!state || state.winner) return;

    const currentSymbol = state.active;

    // Nur der Socket, der auf dem aktiven Sitz sitzt, darf ziehen
    if (state.seats[currentSymbol] !== socket.id) return;

    // Feld frei?
    if (state.board?.[row]?.[col] !== null) return;

    state.board[row][col] = currentSymbol;
    state.turns.unshift({ player: currentSymbol, square: { row, col } });

    // Gewinner prüfen
    state.winner = computeWinner(state.board, state.players);

    // Spieler wechseln (auch wenn Draw, Client kann das anzeigen)
    if (!state.winner) {
      state.active = state.active === "X" ? "O" : "X";
    }

    io.to(roomId).emit("state", state);
  });

  // --- Neustart (Zustand zurücksetzen, Namen & Sitze beibehalten) ---
  socket.on("restart", ({ roomId }) => {
    const old = rooms.get(roomId);
    if (!old) return;

    const fresh = initState();
    // Namen & Sitze übernehmen
    fresh.players = { ...old.players };
    fresh.seats = { ...old.seats };

    rooms.set(roomId, fresh);
    io.to(roomId).emit("state", fresh);
  });

  // --- Verlassen/Disconnect ---
  socket.on("disconnect", () => {
    const roomId = socket.data.roomId;
    if (!roomId) return;

    const state = rooms.get(roomId);
    if (!state) return;

    let role = socket.data.role;

    // Sitz freigeben, falls dieser Socket ihn hielt
    if (state.seats.X === socket.id) {
      state.seats.X = null;
      if (state.active === "X") state.active = "O"; // optional: Zug an O geben
      role = "X";
    } else if (state.seats.O === socket.id) {
      state.seats.O = null;
      if (state.active === "O") state.active = "X";
      role = "O";
    }

    // Info an verbleibende Clients
    socket.to(roomId).emit("left", { roomId, role });

    // Raum behalten (damit der andere weitersieht) – oder leeren, wenn niemand mehr drin ist
    const roomSockets = io.sockets.adapter.rooms.get(roomId);
    if (!roomSockets || roomSockets.size === 0) {
      rooms.delete(roomId);
    } else {
      // Zustand broadcasten (falls sich active geändert hat)
      io.to(roomId).emit("state", state);
    }
  });
});

server.listen(PORT, () => {
  console.log(`Socket.IO server running on :${PORT}`);
});
