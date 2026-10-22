import { ui } from "./state.js";
import { $ } from "./util.js";

let dtm = null;
export function setDiceTimer(id){ clearInterval(dtm); dtm = id; }
export function clearDiceTimer(){ clearInterval(dtm); dtm = null; }

export function showPanel(html){
  const pnl = $("#pnl");
  pnl.innerHTML = html;
  pnl.hidden = false;
  pnl.scrollTop = 0;
}
export function closePanel(){
  ui.pm = null;
  clearDiceTimer();
  const pnl = $("#pnl");
  if (pnl) pnl.hidden = true;
  ui.render();
}
