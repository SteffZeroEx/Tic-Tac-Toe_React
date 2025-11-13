import { useState, useEffect } from "react";
import GameBoard from "./components/GameBoard.jsx";
import Player from "./components/Player.jsx";
import Log from "./components/Log.jsx";
import GameOver from "./components/GameOver.jsx";
import { WINNING_COMBINATIONS } from "./winning-combinations";
import { io } from "socket.io-client";

// 🔌 Socket-Verbindung außerhalb der Komponente (stabil, kein Reconnect pro Render)
const socket = io(import.meta.env.VITE_API_URL ?? "http://localhost:3001");

const PLAYERS = {
  X: "Spieler 1",
  O: "Spieler 2",
};

const INITIAL_GAME_BOARD = [
  [null, null, null],
  [null, null, null],
  [null, null, null],
];

function deriveActivePlayer(gameTurns) {
  let currentPlayer = "X";
  if (gameTurns.length > 0 && gameTurns[0].player === "X") currentPlayer = "O";
  return currentPlayer;
}

function deriveGameBoard(gameTurns) {
  let gameBoard = [...INITIAL_GAME_BOARD.map((array) => [...array])];
  for (const turn of gameTurns) {
    const { square, player } = turn;
    const { row, col } = square;
    gameBoard[row][col] = player;
  }
  return gameBoard;
}

function deriveWinner(gameBoard, players) {
  let winner = null;
  for (const combination of WINNING_COMBINATIONS) {
    const a = gameBoard[combination[0].row][combination[0].column];
    const b = gameBoard[combination[1].row][combination[1].column];
    const c = gameBoard[combination[2].row][combination[2].column];
    if (a && a === b && a === c) {
      winner = players[a];
    }
  }
  return winner;
}

function App() {
  // 🔹 Lokale (Offline) States
  const [players, setPlayers] = useState(PLAYERS);
  const [gameTurns, setGameTurns] = useState([]);

  // 🔹 Online States
  const [roomId, setRoomId] = useState(null);
  const [mySymbol, setMySymbol] = useState(null); // 'X' | 'O' | null (Zuschauer)
  const [remote, setRemote] = useState(null); // {board, turns, players, active, winner, seats?}
  const [notice, setNotice] = useState(null); // kurze Statusmeldungen (join/leave)

  // Socket-Listener
  useEffect(() => {
    const onState = (s) => setRemote({ ...s });
    const onJoined = ({ role }) => {
      setNotice(role === "spectator" ? "Jemand schaut zu." : "Ein Spieler ist beigetreten.");
    };
    const onLeft = ({ role }) => {
      setNotice(
        role === "X" || role === "O"
          ? `Spieler ${role} hat die Sitzung verlassen.`
          : "Ein Zuschauer hat die Sitzung verlassen."
      );
    };

    socket.on("state", onState);
    socket.on("joined", onJoined);
    socket.on("left", onLeft);

    return () => {
      socket.off("state", onState);
      socket.off("joined", onJoined);
      socket.off("left", onLeft);
    };
  }, []);

  // Notice automatisch nach 4s ausblenden
  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), 4000);
    return () => clearTimeout(t);
  }, [notice]);

  // Auto-Join per ?g=ROOMID
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("g");
    if (id) {
      socket.emit("join", { roomId: id }, ({ symbol, error }) => {
        if (!error) {
          setRoomId(id);
          setMySymbol(symbol); // kann null sein (Zuschauer), wenn X und O schon belegt
        } else {
          console.error(error);
        }
      });
    }
  }, []);

  // 🔹 Zustand ableiten (Online bevorzugen, sonst Offline)
  const activePlayer = remote?.active ?? deriveActivePlayer(gameTurns);
  const gameBoard = remote?.board ?? deriveGameBoard(gameTurns);
  const playersUsed = remote?.players ?? players;
  const winner = remote?.winner ?? deriveWinner(gameBoard, playersUsed);
  const hasDraw = (remote?.turns?.length === 9 && !winner) || (gameTurns.length === 9 && !winner);

  // --- Handlers ---
  function handleSelectSquare(rowIndex, colIndex) {
    // Online
    if (roomId && remote) {
      // Nur ziehen, wenn ich X/O bin und auch am Zug bin
      if (!mySymbol || remote.active !== mySymbol) return;
      // Feld belegen:
      socket.emit("move", { roomId, row: rowIndex, col: colIndex });
      return;
    }

    // Offline Fallback
    setGameTurns((prevTurns) => {
      const currentPlayer = deriveActivePlayer(prevTurns);
      const updatedTurns = [{ square: { row: rowIndex, col: colIndex }, player: currentPlayer }, ...prevTurns];
      return updatedTurns;
    });
  }

  function handleRestart() {
    if (roomId) socket.emit("restart", { roomId });
    else setGameTurns([]);
  }

  function handlePlayerNameChange(symbol, newName) {
    if (roomId) socket.emit("rename", { roomId, symbol, name: newName });
    else {
      setPlayers((prevPlayers) => ({
        ...prevPlayers,
        [symbol]: newName,
      }));
    }
  }

  // Online-Spiel erstellen + Einladungslink kopieren
  function createGame() {
    socket.emit("create", ({ roomId, symbol }) => {
      setRoomId(roomId);
      setMySymbol(symbol);
      const invite = `${window.location.origin}/?g=${roomId}`;
      navigator.clipboard
        .writeText(invite)
        .then(() => setNotice("Einladungslink kopiert! Schicke ihn deinem Mitspieler."))
        .catch(() => {
          setNotice("Kopieren fehlgeschlagen – Link manuell kopieren.");
          console.log(invite);
        });
    });
  }

  // --- JSX ---
  return (
    <main>
      <div id="game-container">
        {/* Hinweis-Banner */}
        {notice && <p style={{ textAlign: "center", color: "#fcd256", margin: 0 }}>{notice}</p>}

        {/* Online-Controls */}
        <div style={{ textAlign: "center", marginTop: "1rem" }}>
          {!roomId && <button className="game_btn" onClick={createGame}>Online-Spiel erstellen</button>}

          {roomId && (
            <div>
              <p>Raum-ID: {roomId}</p>
              <p>
                <input
                  className="link_field"
                  type="text"
                  value={`${window.location.origin}/?g=${roomId}`}
                  readOnly
                  style={{
                    width: "80%",
                    textAlign: "center",
                    padding: "0.25rem",
                    borderRadius: "4px",
                  }}
                />
                <button
                className="game_btn"
                  style={{ marginLeft: "0.5rem" }}
                  onClick={() => navigator.clipboard.writeText(`${window.location.origin}/?g=${roomId}`)}>
                  Link kopieren
                </button>
              </p>
              <p>
                Deine Rolle: <strong>{mySymbol ?? "Zuschauer"}</strong> · Am Zug: <strong>{activePlayer}</strong>
              </p>
            </div>
          )}
        </div>

        {/* Spieler-Leiste */}
        <ol id="players" className="highlight-player">
          <Player
            key={`X-${playersUsed.X}`}
            initialName={playersUsed.X}
            symbol="X"
            isActive={activePlayer === "X"}
            onChangeName={handlePlayerNameChange}
          />
          <Player
            key={`O-${playersUsed.O}`}
            initialName={playersUsed.O}
            symbol="O"
            isActive={activePlayer === "O"}
            onChangeName={handlePlayerNameChange}
          />
        </ol>

        {/* Game Over */}
        {(winner || hasDraw) && <GameOver winner={winner} onRestart={handleRestart} />}

        {/* Board */}
        <GameBoard
          onSelectSquare={handleSelectSquare}
          activePlayerSymbol={activePlayer} // aktuell ungenutzt – ggf. für Styling verwenden
          board={gameBoard}
        />
      </div>

      {/* Log (online bevorzugt) */}
      <Log turns={remote?.turns ?? gameTurns} />
    </main>
  );
}

export default App;
