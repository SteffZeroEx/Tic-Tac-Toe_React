import http from "http";
import { Server } from "socket.io";

// Minimaler In-Memory-Zustand pro Room
const rooms = new Map();
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
});

// Gewinn-Kombinationen (kopiert aus deinem Frontend)
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

const server = http.createServer();
const io = new Server(server, {
  cors: { origin: "*" }, // später auf deine Domains einschränken
});

io.on("connection", (socket) => {
  socket.on("create", (cb) => {
    const roomId = crypto.randomUUID();
    rooms.set(roomId, initState());
    socket.join(roomId);
    cb?.({ roomId, symbol: "X" });
  });

  socket.on("join", ({ roomId }, cb) => {
    const s = rooms.get(roomId);
    if (!s) return cb?.({ error: "Room not found" });
    socket.join(roomId);
    cb?.({ roomId, symbol: "O" });
    io.to(roomId).emit("state", s);
  });

  socket.on("rename", ({ roomId, symbol, name }) => {
    const s = rooms.get(roomId);
    if (!s) return;
    s.players[symbol] = String(name).slice(0, 20);
    io.to(roomId).emit("state", s);
  });

  socket.on("move", ({ roomId, row, col }) => {
    const s = rooms.get(roomId);
    if (!s || s.winner) return;
    if (s.board[row][col] !== null) return;

    const symbol = s.active;
    s.board[row][col] = symbol;
    s.turns.unshift({ player: symbol, square: { row, col } });

    // Gewinn prüfen
    for (const combo of WINNING_COMBINATIONS) {
      const a = s.board[combo[0].row][combo[0].column];
      const b = s.board[combo[1].row][combo[1].column];
      const c = s.board[combo[2].row][combo[2].column];
      if (a && a === b && a === c) {
        s.winner = s.players[a];
        break;
      }
    }
    s.active = s.active === "X" ? "O" : "X";
    io.to(roomId).emit("state", s);
  });

  socket.on("restart", ({ roomId }) => {
    rooms.set(roomId, initState());
    io.to(roomId).emit("state", rooms.get(roomId));
  });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => console.log("Socket server on", PORT));
