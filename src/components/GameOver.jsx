export default function GameOver({ winner, onRestart }) {
  return (
    <div id="game-over">
      <h2>Game Over!</h2>
      {winner && <p>{winner} hat gewonnen!</p>}
      {!winner && <p>Unentschieden!</p>}
      <p>
        <button onClick={onRestart}>Erneut spielen!</button>
      </p>
    </div>
  );
}
