// Feedback audio de GapPuzzle (CHESS2.md §3) — synthèse Web Audio, aucun
// asset, aucune licence à vérifier. `initAudio` doit être appelée au premier
// geste utilisateur : un AudioContext créé au montage démarre `suspended`
// et le premier son sortirait silencieusement sinon.

let ctx: AudioContext | null = null;

function blip(freq: number, dur: number, type: OscillatorType = "sine") {
  if (!ctx) return;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(0.08, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
  osc.connect(gain).connect(ctx.destination);
  osc.start();
  osc.stop(ctx.currentTime + dur);
}

export function initAudio() {
  if (!ctx) ctx = new AudioContext();
  if (ctx.state === "suspended") ctx.resume();
}

export const sfx = {
  move: () => blip(440, 0.06, "triangle"),
  capture: () => blip(220, 0.09, "triangle"),
  mate: () => blip(330, 0.12, "triangle"),
};
