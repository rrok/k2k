/**
 * Attrezzi del carrozziere disegnati su canvas 2D: usati dal percorso di
 * riparazione e dal minigioco.
 */

/** Platorello rotante (levigatrice o lucidatrice). */
export function drawPad(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, spin: number, alpha: number, light: string, dark: string): void {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(x, y);
  // scia del movimento
  ctx.strokeStyle = 'rgba(255,255,255,0.22)';
  ctx.lineWidth = r * 0.08;
  for (const k of [1.25, 1.5]) {
    ctx.beginPath();
    ctx.arc(0, 0, r * k, spin * 0.2, spin * 0.2 + 1.1);
    ctx.stroke();
  }
  // corpo della macchina, impugnato in alto a destra
  ctx.lineCap = 'round';
  ctx.strokeStyle = '#17191c';
  ctx.lineWidth = r * 0.62;
  ctx.beginPath();
  ctx.moveTo(r * 0.2, -r * 0.3);
  ctx.lineTo(r * 1.9, -r * 2.5);
  ctx.stroke();
  ctx.strokeStyle = '#c8102e';
  ctx.lineWidth = r * 0.62;
  ctx.beginPath();
  ctx.moveTo(r * 1.05, -r * 1.4);
  ctx.lineTo(r * 1.3, -r * 1.72);
  ctx.stroke();
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.beginPath();
  ctx.arc(r * 0.08, r * 0.14, r * 1.04, 0, Math.PI * 2);
  ctx.fill();
  const pad = ctx.createRadialGradient(-r * 0.3, -r * 0.3, r * 0.1, 0, 0, r);
  pad.addColorStop(0, light);
  pad.addColorStop(1, dark);
  ctx.fillStyle = pad;
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.rotate(spin);
  ctx.strokeStyle = 'rgba(0,0,0,0.2)';
  ctx.lineWidth = r * 0.1;
  for (let i = 0; i < 6; i++) {
    ctx.rotate(Math.PI / 3);
    ctx.beginPath();
    ctx.moveTo(r * 0.34, 0);
    ctx.lineTo(r * 0.88, 0);
    ctx.stroke();
  }
  ctx.fillStyle = '#17191c';
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.24, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/** Panno in microfibra, un po' stropicciato. */
export function drawCloth(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, wobble: number, alpha: number): void {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(x, y);
  ctx.rotate(Math.sin(wobble) * 0.18);
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.beginPath();
  ctx.ellipse(r * 0.06, r * 0.14, r * 1.02, r * 0.78, 0, 0, Math.PI * 2);
  ctx.fill();
  const g = ctx.createLinearGradient(-r, -r, r, r);
  g.addColorStop(0, '#5fb3f3');
  g.addColorStop(1, '#1f6fc4');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(-r, -r * 0.55);
  ctx.quadraticCurveTo(-r * 0.2, -r * 0.95, r * 0.85, -r * 0.6);
  ctx.quadraticCurveTo(r * 1.1, 0, r * 0.8, r * 0.62);
  ctx.quadraticCurveTo(0, r * 0.9, -r * 0.9, r * 0.6);
  ctx.quadraticCurveTo(-r * 1.15, 0, -r, -r * 0.55);
  ctx.fill();
  // pieghe
  ctx.strokeStyle = 'rgba(255,255,255,0.35)';
  ctx.lineWidth = Math.max(1, r * 0.06);
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(-r * 0.55, -r * 0.3);
  ctx.quadraticCurveTo(0, -r * 0.05, r * 0.5, -r * 0.32);
  ctx.moveTo(-r * 0.45, r * 0.25);
  ctx.quadraticCurveTo(r * 0.05, r * 0.05, r * 0.45, r * 0.3);
  ctx.stroke();
  ctx.restore();
}
