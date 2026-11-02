/** Welches Panel hinter dem offenen Rezept wieder erscheinen soll, und das letzte Würfelergebnis. */

const RETURNABLE = new Set(["D", "F", "Y"]);

let behind = null;
let diceId = null;

export function diceResult(){
  return diceId;
}

export function setDiceResult(id){
  diceId = id || null;
}

export function panelBehind(){
  return behind;
}

/** Rezept aus einem Panel öffnen. Ohne Panel (Rezeptliste) bleibt nichts zum Zurückkehren. */
export function openFromPanel(fromPanel){
  behind = RETURNABLE.has(fromPanel) ? fromPanel : null;
  return behind;
}

/** Zurück vom Rezept: Panel-Code einmal lesen und vergessen. */
export function takeBehind(){
  const v = behind;
  behind = null;
  return v;
}

/**
 * Panel wurde wirklich geschlossen (Schließen oder Wisch).
 * Nur das Würfel-Panel verwirft das Ergebnis. Ein anderes Panel
 * (etwa der Editor) lässt Würfeln und die Rückkehr dorthin in Ruhe,
 * solange es nicht selbst das Panel hinter dem Rezept war.
 */
export function panelClosed(pm){
  if (pm && pm === behind) behind = null;
  if (pm === "D") diceId = null;
}

export function resetPanelReturn(){
  behind = null;
  diceId = null;
}
