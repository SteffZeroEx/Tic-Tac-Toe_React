import { useState, useEffect } from "react";

export default function Player({ initialName, symbol, isActive, onChangeName }) {
  const [playerName, setPlayerName] = useState(initialName);
  const [isEditing, setIsEditing] = useState(false);

  useEffect(() => {
    // wenn der Name (vom Server) wechselt, auch im Input aktualisieren
    setPlayerName(initialName);
  }, [initialName]);

  function handleEditClick() {
    setIsEditing((editing) => !editing);
    if (isEditing) onChangeName(symbol, playerName);
  }

  function handleNameChange(event) {
    setPlayerName(event.target.value);
  }

  let editablePlayerName = <span className="player-name">{playerName}</span>;

  if (isEditing) {
    editablePlayerName = <input type="text" required value={playerName} onChange={handleNameChange} />;
  }

  return (
    <li className={isActive ? "active" : undefined}>
      <span className="player">
        {editablePlayerName}
        <span className="player-symbol">{symbol}</span>
      </span>
      <button onClick={handleEditClick}>{isEditing ? "Speichern" : "Bearbeiten"}</button>
    </li>
  );
}

// {
//   isEditing ? (
//     <input type="text" value={playerName} onChange={handleNameChange} />
//   ) : (
//     <span className="player-name">{name}</span>
//   );
// }
