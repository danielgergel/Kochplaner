/* Screenshot einlesen: Bild aufbereiten, deutsch erkennen, unsichere Wörter verwerfen. */
import { $, toast } from "./util.js";
import { textFromRecognition, parseRecipeText } from "./ocr-text.js";
import { showOcrReview } from "./recipes.js";

let tessP = null;
function loadTess(){
  if (window.Tesseract) return Promise.resolve();
  if (tessP) return tessP;
  tessP = new Promise((res, rej) => {
    const s = document.createElement("script");
    s.src = "https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js";
    s.onload = () => res();
    s.onerror = () => { tessP = null; rej(new Error("load")); };
    document.head.appendChild(s);
  });
  return tessP;
}

function otsu(hist, total){
  let sum = 0;
  for (let i = 0; i < 256; i++) sum += i * hist[i];
  let sumB = 0, wB = 0, max = 0, th = 127;
  for (let i = 0; i < 256; i++) {
    wB += hist[i];
    if (!wB) continue;
    const wF = total - wB;
    if (!wF) break;
    sumB += i * hist[i];
    const mB = sumB / wB, mF = (sum - sumB) / wF;
    const v = wB * wF * (mB - mF) * (mB - mF);
    if (v > max) { max = v; th = i; }
  }
  return th;
}

export async function preprocessImage(file){
  const bmp = await createImageBitmap(file);
  const long = Math.max(bmp.width, bmp.height);
  let scale = 1;
  if (long < 1400) scale = Math.min(2, 1600 / long);
  else if (long > 2200) scale = 2200 / long;
  const w = Math.max(1, Math.round(bmp.width * scale));
  const h = Math.max(1, Math.round(bmp.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently:true });
  ctx.drawImage(bmp, 0, 0, w, h);
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  const gray = new Uint8ClampedArray(w * h);
  let min = 255, max = 0, sum = 0;
  for (let i = 0, p = 0; i < d.length; i += 4, p++) {
    const g = (d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114) | 0;
    gray[p] = g;
    sum += g;
    if (g < min) min = g;
    if (g > max) max = g;
  }
  const mean = sum / gray.length;
  const invert = mean < 110;
  const span = Math.max(1, max - min);
  const hist = new Uint32Array(256);
  for (let p = 0; p < gray.length; p++) {
    let g = Math.max(0, Math.min(255, Math.round((gray[p] - min) * 255 / span)));
    if (invert) g = 255 - g;
    gray[p] = g;
    hist[g]++;
  }
  const th = otsu(hist, gray.length);
  for (let p = 0, i = 0; p < gray.length; p++, i += 4) {
    const g = gray[p];
    const pushed = g < th ? g * 0.82 : Math.min(255, g + (255 - g) * 0.18);
    d[i] = d[i + 1] = d[i + 2] = pushed;
    d[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  if (bmp.close) bmp.close();
  return canvas;
}

async function ocrFiles(files, onProg){
  await loadTess();
  const worker = await window.Tesseract.createWorker("deu", 1, {
    langPath: "https://cdn.jsdelivr.net/npm/@tesseract.js-data/deu/4.0.0_best_int",
    logger: m => { if (m && m.status === "recognizing text" && onProg) onProg(m.progress || 0); },
  });
  try { await worker.setParameters({ tessedit_pageseg_mode: "6", preserve_interword_spaces: "1" }); } catch (e) {}
  const kept = [], dropped = [];
  try {
    for (let i = 0; i < files.length; i++) {
      let src = files[i];
      try { src = await preprocessImage(files[i]); } catch (e) {}
      const r = await worker.recognize(src);
      const part = textFromRecognition(r && r.data);
      kept.push(part.text);
      dropped.push(...part.dropped);
      if (onProg) onProg((i + 1) / files.length);
    }
  } finally {
    try { await worker.terminate(); } catch (e) {}
  }
  return { text: kept.filter(Boolean).join("\n\n"), dropped };
}

export function bindOcr(){
  document.addEventListener("change", async ev => {
    const f = ev.target;
    if (!f || f.id !== "cr-img" || !f.files || !f.files.length) return;
    const files = [...f.files];
    const st = () => $("#crimpst");
    try {
      if (st()) st().textContent = "Bild wird vorbereitet …";
      const { text, dropped } = await ocrFiles(files, p => { if (st()) st().textContent = "Text wird erkannt … " + Math.round(p * 100) + " %"; });
      if (!text.trim() && !dropped.length) {
        if (st()) st().textContent = "Kein Text erkannt. Probier einen schärferen Screenshot oder füge den Text unten ein.";
        return;
      }
      const raw = $("#cr-raw");
      if (raw) { raw.value = text; const det = raw.closest("details"); if (det) det.open = true; }
      const parsed = parseRecipeText(text);
      showOcrReview(parsed, dropped.filter(l => !parsed.dropped.includes(l)));
    } catch (e) {
      if (st()) st().textContent = "Texterkennung nicht möglich. Beim ersten Mal braucht sie Internet. Du kannst den Text auch unten einfügen.";
      toast("Texterkennung nicht möglich");
    }
    f.value = "";
  });
}
