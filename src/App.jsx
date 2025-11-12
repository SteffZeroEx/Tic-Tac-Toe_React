import { useState, useEffect } from "react";
import GameBoard from "./components/GameBoard.jsx";
import Player from "./components/Player.jsx";
import Log from "./components/Log.jsx";
import GameOver from "./components/GameOver.jsx";
import { WINNING_COMBINATIONS } from "./winning-combinations";
import { io } from "socket.io-client"

const socket = io(import.meta.env.VITE_API_URL ?? "http://localhost:3001");

const PLAYERS = {
  X: "Spieler 1",
  O: "Spieler 2"
}

const INITIAL_GAME_BOARD = [
  [null, null, null],
  [null, null, null],
  [null, null, null],
];

function deriveActivePlayer(gameTurns) {
  let currentPlayer = "X";

  if (gameTurns.length > 0 && gameTurns[0].player === "X") {
    currentPlayer = "O";
  }

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
    const firstSquareSymbol = gameBoard[combination[0].row][combination[0].column];
    const secondSquareSymbol = gameBoard[combination[1].row][combination[1].column];
    const thirdSquareSymbol = gameBoard[combination[2].row][combination[2].column];

    if (firstSquareSymbol && firstSquareSymbol === secondSquareSymbol && firstSquareSymbol === thirdSquareSymbol) {
      winner = players[firstSquareSymbol];
    }
  }
  return winner;
}

function App() {
  const [players, setPlayers] = useState(PLAYERS);
  const [gameTurns, setGameTurns] = useState([]);

  // Socket-bezogene States
  const [roomId, setRoomId] = useState(null);
  const [mySymbol, setMySymbol] = useState(null);
  const [remote, setRemote] = useState(null); // {board, turns, players, active, winner}

  useEffect(() => {
    socket.on("state", (s) => setRemote({ ...s }));
    return () => socket.off("state");
  }, []);


   useEffect(() => {
     const id = new URLSearchParams(window.location.search).get("g");
     if (id) {
       socket.emit("join", { roomId: id }, ({ symbol, error }) => {
         if (!error) {
           setRoomId(id);
           setMySymbol(symbol);
         } else {
           console.error(error);
         }
       });
     }
   }, []);

  const activePlayer = remote?.active ?? deriveActivePlayer(gameTurns);
  const gameBoard = remote?.board ?? deriveGameBoard(gameTurns);
  const playersUsed = remote?.players ?? players;
  const winner = remote?.winner ?? deriveWinner(gameBoard, playersUsed);
  const hasDraw = (remote?.turns?.length === 9 && !winner) || (gameTurns.length === 9 && !winner);


  function handleSelectSquare(rowIndex, coloumnIndex) {
    // Online
    if (roomId && remote) {
      if (remote.active !== mySymbol) return; // nicht dran
      socket.emit("move", { roomId, row: rowIndex, col: coloumnIndex });
      return;
    }

    // Offline fallback
    setGameTurns((prevTurns) => {
      const currentPlayer = deriveActivePlayer(prevTurns);
      const updatedTurns = [{ square: { row: rowIndex, col: coloumnIndex }, player: currentPlayer }, ...prevTurns];
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
  function createGame() {
    socket.emit("create", ({ roomId, symbol }) => {
      setRoomId(roomId);
      setMySymbol(symbol);
      const invite = `${window.location.origin}/?g=${roomId}`;
      navigator.clipboard
        .writeText(invite)
        .then(() => alert(`Einladungslink wurde in die Zwischenablage kopiert!\n\n${invite}`))
        .catch(() => alert(`Kopieren fehlgeschlagen.\n\n${invite}`));

    });
  }


  return (
    <main>
      <div id="game-container">
        <div style={{ textAlign: "center", marginTop: "1rem" }}>
          {!roomId && <button onClick={createGame}>Online-Spiel erstellen</button>}
          {roomId && <p>Raum-ID: {roomId}</p>}
        </div>

        <ol id="players" className="highlight-player">
          <Player
            initialName={playersUsed.X}
            symbol="X"
            isActive={activePlayer === "X"}
            onChangeName={handlePlayerNameChange}
          />
          <Player
            initialName={playersUsed.O}
            symbol="O"
            isActive={activePlayer === "O"}
            onChangeName={handlePlayerNameChange}
          />
        </ol>
        {(winner || hasDraw) && <GameOver winner={winner} onRestart={handleRestart} />}
        <GameBoard onSelectSquare={handleSelectSquare} board={gameBoard} />
      </div>
      <Log turns={remote?.turns ?? gameTurns} />
    </main>
  );
}

export default App;
