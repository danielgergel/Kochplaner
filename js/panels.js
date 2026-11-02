import { ui } from "./state.js";
import { $ } from "./util.js";
import { panelClosed } from "./panel-return.js";

let dtm = null;
export function setDiceTimer(id){ clearInterval(dtm); dtm = id; }
export function clearDiceTimer(){ clearInterval(dtm); dtm = null; }

export function showPanel(html){
  const pnl = $("#pnl");
  pnl.innerHTML = html;
  pnl.hidden = false;
  pnl.scrollTop = 0;
}
export function hidePanel(){
  clearDiceTimer();
  const pnl = $("#pnl");
  if (pnl) pnl.hidden = true;
}
export function closePanel(){
  const pm = ui.pm;
  ui.pm = null;
  clearDiceTimer();
  const pnl = $("#pnl");
  if (pnl) pnl.hidden = true;
  panelClosed(pm);
  ui.render();
}
