import { useEffect, useRef } from "react";
import type { PAD } from "../lib/color";
import {
  SESSION_BG,
  type BgAnimationConfig,
  type BgRipple,
  type BgWaterfall,
  type BgSunBreathe,
  type BgBirds,
  type BgMist,
  type BgWaterShimmer,
} from "./bgManifest";

// 照片动效叠加层
// 只画当前照片 config 声明过的东西。playing 时所有效果轻微加强 (幅度/速度约 1.3x)。
// PAD 情绪继续渗透:
//   arousal (a) → 全局速度基线
//   valence (p) → 涟漪 / 波光暖冷偏移

export type ShanShuiCanvasProps = {
  pad: PAD;
  playing?: boolean;
  /** Override config for tests. */
  configOverride?: BgAnimationConfig | null;
};

type SmoothedPad = { p: number; a: number; d: number };

export function ShanShuiCanvas({
  pad,
  playing = false,
  configOverride,
}: ShanShuiCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number | null>(null);
  const padRef = useRef<PAD>(pad);
  const playingRef = useRef<boolean>(playing);
  const smoothedRef = useRef<SmoothedPad>({ p: pad.p, a: pad.a, d: pad.d });

  const config: BgAnimationConfig =
    configOverride ?? SESSION_BG?.config ?? {};

  useEffect(() => {
    padRef.current = pad;
  }, [pad]);

  useEffect(() => {
    playingRef.current = playing;
  }, [playing]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    // jsdom (test env) throws on getContext; degrade to a no-op there.
    let ctx: CanvasRenderingContext2D | null = null;
    try {
      ctx = canvas.getContext("2d");
    } catch {
      return;
    }
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      canvas.width = Math.max(1, Math.floor(rect.width * dpr));
      canvas.height = Math.max(1, Math.floor(rect.height * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener("resize", resize);

    const start = performance.now();

    const draw = (now: number) => {
      const t = (now - start) / 1000;

      // PAD 低通滤波,画面比音乐慢半拍
      const target = padRef.current;
      const s = smoothedRef.current;
      const alpha = 0.015;
      s.p += (target.p - s.p) * alpha;
      s.a += (target.a - s.a) * alpha;
      s.d += (target.d - s.d) * alpha;

      const rect = canvas.getBoundingClientRect();
      const W = rect.width;
      const H = rect.height;
      if (W < 2 || H < 2) {
        rafRef.current = requestAnimationFrame(draw);
        return;
      }

      ctx.clearRect(0, 0, W, H);

      const warm = (s.p + 1) / 2; // 0..1
      const arousalAbs = Math.min(1, Math.abs(s.a));
      const boost = playingRef.current ? 1.3 : 1.0;

      // 顺序:雾在最底 → 水波光 → 瀑布 → 太阳呼吸 → 涟漪 → 飞鸟
      if (config.mist) drawMist(ctx, W, H, t, config.mist);
      if (config.waterShimmer)
        drawWaterShimmer(ctx, W, H, t, config.waterShimmer, arousalAbs, boost, warm);
      if (config.waterfalls) {
        for (const wf of config.waterfalls) drawWaterfall(ctx, W, H, t, wf, boost);
      }
      if (config.sunBreathe) drawSunBreathe(ctx, W, H, t, config.sunBreathe, boost);
      if (config.ripples) {
        for (const rp of config.ripples) drawRipple(ctx, W, H, t, rp, boost, warm);
      }
      if (config.birds) drawBirds(ctx, W, H, t, config.birds, boost);

      rafRef.current = requestAnimationFrame(draw);
    };

    rafRef.current = requestAnimationFrame(draw);

    return () => {
      window.removeEventListener("resize", resize);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      data-testid="shanshui-canvas"
      style={{
        position: "fixed",
        inset: 0,
        width: "100%",
        height: "100%",
        zIndex: 0,
        pointerEvents: "none",
      }}
    />
  );
}

// ── 效果绘制 ─────────────────────────────────────────────

// 涟漪:焦点位置向外扩散的三层同心椭圆 (椭圆压扁模拟水面视角)
function drawRipple(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  t: number,
  rp: BgRipple,
  boost: number,
  warm: number,
) {
  const cx = rp.xFrac * W;
  const cy = rp.yFrac * H;
  const period = rp.periodS / boost;
  const nRings = 3;
  const tint = 235 + warm * 15;
  for (let i = 0; i < nRings; i++) {
    const phase = (((t / period) + i / nRings) % 1 + 1) % 1;
    const r = phase * rp.radiusPx;
    const alpha = (1 - phase) * 0.28 * boost;
    ctx.strokeStyle = `rgba(${tint}, ${tint}, ${tint - 5}, ${alpha})`;
    ctx.lineWidth = 1.1;
    ctx.beginPath();
    // yr 小是"水面透视"效果
    ctx.ellipse(cx, cy, r, r * 0.32, 0, 0, Math.PI * 2);
    ctx.stroke();
  }
}

// 瀑布:多段短白丝逐帧向下,首尾用正弦淡入淡出
function drawWaterfall(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  t: number,
  wf: BgWaterfall,
  boost: number,
) {
  const x = wf.xFrac * W;
  const y = wf.yFrac * H;
  const h = wf.heightPx;
  const strands = 6;
  const speed = 0.55 * boost;
  const segLen = 10;
  for (let s = 0; s < 2; s++) {
    // 两股水:左右微错
    const xOff = s === 0 ? -1 : 2;
    for (let i = 0; i < strands; i++) {
      const phase = ((t * speed + i / strands) % 1 + 1) % 1;
      const yPos = y + phase * h;
      const alpha = Math.sin(phase * Math.PI) * 0.35 * boost;
      ctx.strokeStyle = `rgba(255, 255, 255, ${alpha})`;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(x + xOff, yPos);
      ctx.lineTo(x + xOff, yPos + segLen);
      ctx.stroke();
    }
  }
}

// 太阳/月呼吸:径向渐变的双层光晕,周期 ~8s
function drawSunBreathe(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  t: number,
  su: BgSunBreathe,
  boost: number,
) {
  const cx = su.xFrac * W;
  const cy = su.yFrac * H;
  const breath = 0.6 + Math.sin(t * 0.55) * 0.28;
  const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, su.radiusPx);
  grad.addColorStop(0, `rgba(${su.color}, ${0.28 * breath * boost})`);
  grad.addColorStop(0.55, `rgba(${su.color}, ${0.10 * breath * boost})`);
  grad.addColorStop(1, `rgba(${su.color}, 0)`);
  ctx.fillStyle = grad;
  ctx.fillRect(
    cx - su.radiusPx,
    cy - su.radiusPx,
    su.radiusPx * 2,
    su.radiusPx * 2,
  );
}

// 飞鸟:一排小 V 从左向右缓飞,y 上轻微波动
function drawBirds(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  t: number,
  bi: BgBirds,
  boost: number,
) {
  const baseY = bi.yFrac * H;
  const speed = bi.speed * boost;
  ctx.strokeStyle = `rgba(45, 45, 55, 0.75)`;
  ctx.lineWidth = 1.1;
  ctx.lineCap = "round";
  for (let i = 0; i < bi.count; i++) {
    const seed = i * 47;
    const rawX = ((t * speed + seed) % (W + 80)) - 40;
    const y = baseY + Math.sin(t * 0.9 + i * 1.3) * 6 + i * 3;
    // V 形,张角约 30°,size 3-5
    const size = 4 + (i % 2);
    ctx.beginPath();
    ctx.moveTo(rawX - size, y + size * 0.3);
    ctx.lineTo(rawX, y - size * 0.4);
    ctx.lineTo(rawX + size, y + size * 0.3);
    ctx.stroke();
  }
}

// 起雾:一整条横向白雾带,alpha 随 sin 缓慢起伏
function drawMist(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  t: number,
  mi: BgMist,
) {
  const top = mi.topFrac * H;
  const height = (mi.bottomFrac - mi.topFrac) * H;
  const alphaMid = 0.10 + Math.sin(t * 0.14) * 0.03;
  const grad = ctx.createLinearGradient(0, top, 0, top + height);
  grad.addColorStop(0, "rgba(255, 255, 255, 0)");
  grad.addColorStop(0.5, `rgba(255, 255, 255, ${alphaMid})`);
  grad.addColorStop(1, "rgba(255, 255, 255, 0)");
  ctx.fillStyle = grad;
  ctx.fillRect(0, top, W, height);
}

// 水面波光:多条横向正弦扫动,营造"水在动"的错觉,不改照片本体
function drawWaterShimmer(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  t: number,
  ws: BgWaterShimmer,
  arousal: number,
  boost: number,
  warm: number,
) {
  const top = ws.topFrac * H;
  const height = (ws.bottomFrac - ws.topFrac) * H;
  const flowSpeed = (0.35 + arousal * 0.9) * boost;
  const amp = 2.2 + arousal * 3.0;
  const tint = 240 + warm * 12;
  ctx.lineWidth = 0.6;
  const rows = 6;
  for (let i = 0; i < rows; i++) {
    const rowY = top + ((i + 0.5) / rows) * height;
    // 越靠上 (远) 越透明
    const perspective = 0.4 + (i / (rows - 1)) * 0.6;
    const alpha = 0.10 * perspective * boost;
    ctx.strokeStyle = `rgba(${tint}, ${tint}, ${tint - 8}, ${alpha})`;
    ctx.beginPath();
    for (let x = 0; x <= W; x += 6) {
      const y =
        rowY +
        Math.sin(x * 0.020 + t * flowSpeed + i * 0.7) * amp * perspective +
        Math.sin(x * 0.055 + t * flowSpeed * 1.3 + i) * amp * 0.4 * perspective;
      if (x === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
}
