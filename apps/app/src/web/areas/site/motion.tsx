// spec/app/site/index.md, "Story: Check the service status"
import { AudioLines } from "lucide-react";
import { useCallback, useSyncExternalStore } from "react";
import { motionKey, motionChangeEvent, reducedQuery, useAmbientMotion, setMotionPaused } from "./chrome.tsx";
import type { Theme } from "./chrome.tsx";

const reduced = () => matchMedia(reducedQuery).matches;

function subscribeReduced(update: () => void) {
  const media = matchMedia(reducedQuery);
  media.addEventListener("change", update);
  window.addEventListener("storage", update);
  window.addEventListener(motionChangeEvent, update);
  return () => {
    media.removeEventListener("change", update);
    window.removeEventListener("storage", update);
    window.removeEventListener(motionChangeEvent, update);
  };
}

export function MotionSwitch({ icon = false }: { icon?: boolean }) {
  const motion = useAmbientMotion();
  const systemReduced = useSyncExternalStore(subscribeReduced, reduced, () => false);

  function toggle() {
    setMotionPaused(motion);
    try {
      localStorage.setItem(motionKey, motion ? "off" : "on");
    } catch {
      setMotionPaused(motion);
    }
    window.dispatchEvent(new Event(motionChangeEvent));
  }

  return (
    <button
      type="button"
      role="switch"
      aria-label="Ambient motion"
      aria-checked={motion}
      disabled={systemReduced}
      title={systemReduced ? "Disabled by your device’s reduced-motion setting" : undefined}
      className={icon ? "button quiet small footer-motion" : "toggle"}
      onClick={toggle}
    >
      {icon ? (
        <>
          <AudioLines size={16} aria-hidden="true" /> Motion
        </>
      ) : (
        <span />
      )}
    </button>
  );
}

const bayer = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
const unit = (value: number) => Math.min(1, Math.max(0, value));

function startVisualizer(canvas: HTMLCanvasElement, motion: boolean, theme: Theme) {
    const context = canvas.getContext("2d");
    if (!context) return;
    const field = canvas;
    const ctx = context;
    if (!motion || reduced()) {
      ctx.clearRect(0, 0, field.width, field.height);
      return;
    }
    const footer = field.parentElement?.querySelector(".site-footer");
    const contrast = matchMedia("(prefers-contrast: more)");
    const systemLight = matchMedia("(prefers-color-scheme: light)");
    let width = 0;
    let height = 0;
    let frame = 0;
    let lastPaint = 0;
    let lastScroll = -10_000;
    let scrollPosition = window.scrollY;
    let scrollPane: HTMLElement | null = null;
    let scrollImpulse = 0;
    let movement = 0;
    let drift = 0;
    let edgePhase = 0;
    let tint = "";
    let light = false;

    function queue() {
      if (!frame && !document.hidden && !contrast.matches) frame = requestAnimationFrame(paint);
    }

    function size() {
      const ratio = Math.min(1.5, window.devicePixelRatio || 1);
      width = field.clientWidth;
      height = field.clientHeight;
      field.width = Math.round(width * ratio);
      field.height = Math.round(height * ratio);
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
      tint = getComputedStyle(field).color;
      light = theme === "light" || (theme === "system" && systemLight.matches);
      queue();
    }

    function onScroll(event: Event) {
      const pane =
        event.target instanceof HTMLElement && event.target !== document.documentElement
          ? event.target
          : null;
      const next = pane?.scrollTop ?? window.scrollY;
      const delta = pane === scrollPane ? next - scrollPosition : 0;
      scrollPane = pane;
      scrollPosition = next;
      if (!delta) return;
      const now = performance.now();
      const speed = delta / Math.min(50, Math.max(12, now - lastScroll));
      scrollImpulse = Math.sign(speed) * unit((Math.abs(speed) - 0.04) / 1.65);
      lastScroll = now;
      queue();
    }

    function onVisibility() {
      if (document.hidden) {
        cancelAnimationFrame(frame);
        frame = 0;
      } else queue();
    }

    function paint(now: number) {
      frame = 0;
      if (!width || !height || contrast.matches) return;
      if (now - lastPaint < 36) {
        queue();
        return;
      }
      const elapsed = Math.min(42, now - lastPaint);
      lastPaint = now;
      const scroll = window.scrollY;
      const top = unit(1 - scroll / (height * 0.94)) ** 1.55;
      const tail = unit(1 - (now - lastScroll - 74) / 390);
      const velocity = scrollImpulse * tail * tail * (3 - 2 * tail);
      const target = Math.abs(velocity);
      movement += (target - movement) * (1 - Math.exp(-elapsed / (target > movement ? 235 : 310)));
      drift += (velocity - drift) * (1 - Math.exp(-elapsed / 260));
      edgePhase += drift * elapsed * 0.008;
      const footerBounds = footer?.getBoundingClientRect();
      const footerTop = footerBounds?.top ?? height;
      const footerVisible = unit((height - footerTop) / Math.max(1, footerBounds?.height ?? 1));
      const bass = footerVisible * (1 - movement * 0.79);

      ctx.clearRect(0, 0, width, height);
      if (top < 0.012 && movement < 0.012 && bass < 0.012) return;

      const step = width < 600 ? 5 : 7;
      const dot = (width < 600 ? 1.12 : 1.38) + (light ? 0.24 : 0);
      const margin = Math.min(135, width * 0.15);
      const time = now / 1000;
      const crest = time * 54 + height * 0.26 - 87;
      const footerDepth = Math.min(118, height - footerTop);
      const columns = Array.from({ length: Math.ceil((width - 2) / step) }, (_, col) => {
        const x = 2 + col * step;
        const horizontal = x / width;
        const edge = unit(1 - Math.min(x, width - x) / margin);
        const fold =
          Math.sin(horizontal * 7.4 + time * 0.41) * 68 + Math.sin(horizontal * 17 - time * 0.63) * 26;
        const footerWave = 0.5 + 0.5 * Math.sin(x * 0.012 - time * 1.1);
        const spectrum = 0.5 + 0.5 * Math.sin(x * 0.053 + time * 2 + footerWave);
        const barHeight = Math.max(1, footerDepth * (0.16 + footerWave * 0.34 + spectrum * 0.39));
        return { x, edge, fold, barHeight };
      });
      const ribbon = [new Path2D(), new Path2D(), new Path2D()];
      const echo = new Path2D();
      const edges = new Path2D();
      const floor = new Path2D();
      for (let y = 2, row = 0; y < height; y += step, row++) {
        const upper = top * unit(1 - y / (height * 0.8)) ** 1.2;
        const isFooter = bass > 0.012 && y >= footerTop;
        if (upper < 0.045 && !isFooter && movement < 0.012) continue;

        for (let col = 0; col < columns.length; col++) {
          const { x, edge, fold, barHeight } = columns[col];
          const threshold = (bayer[(row % 4) * 4 + (col % 4)] + 1) / 18;
          if (upper >= 0.045) {
            const distance = y - crest + fold;
            const phase = ((distance % 360) + 360) % 360;
            const primary = unit(1 - Math.min(phase, 360 - phase) / 86) ** 1.55;
            const afterimage = unit(1 - Math.abs(phase - 111) / 52) ** 1.9;
            const strength = upper * primary * (light ? 1.36 : 1.11);
            if (strength > threshold) {
              const tone = strength > 0.62 ? 2 : strength > 0.29 ? 1 : 0;
              const size = dot + tone * 0.16;
              const dash = tone === 2 && (col + row) % 5 === 0 ? 1.65 : 1;
              ribbon[tone].rect(x, y, size * dash, size);
            } else if (upper * afterimage * (light ? 0.71 : 0.48) > threshold) {
              echo.rect(x, y, dot, dot);
            }
          }
          if (movement >= 0.012 && edge > 0) {
            const sweep = Math.sin(y * 0.033 - edgePhase + edge * 4.3) * 0.5 + 0.5;
            if (edge ** 1.75 * (0.1 + sweep ** 2.4 * 0.76) > threshold) {
              edges.rect(x, y, dot + 0.25, dot);
            }
          }
          if (isFooter && unit(1 - (height - y) / barHeight) * (0.41 + 0.51 * edge) > threshold) {
            floor.rect(x, y, dot, dot);
          }
        }
      }
      ctx.fillStyle = light ? "#5876e2" : "#f17c68";
      ctx.globalAlpha = light ? 0.29 : 0.2;
      ctx.fill(echo);
      ctx.fillStyle = tint;
      const levels = light ? [0.22, 0.45, 0.69] : [0.12, 0.27, 0.48];
      ribbon.forEach((tone, index) => {
        ctx.globalAlpha = levels[index];
        ctx.fill(tone);
      });
      ctx.globalAlpha = movement * (light ? 0.53 : 0.46);
      ctx.fill(edges);
      ctx.globalAlpha = bass * (light ? 0.3 : 0.28);
      ctx.fill(floor);
      ctx.globalAlpha = 1;
      queue();
    }

    const resize = new ResizeObserver(size);
    resize.observe(field);
    window.addEventListener("scroll", onScroll, { capture: true, passive: true });
    document.addEventListener("visibilitychange", onVisibility);
    contrast.addEventListener("change", size);
    systemLight.addEventListener("change", size);
    size();

    return () => {
      resize.disconnect();
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", onScroll, true);
      document.removeEventListener("visibilitychange", onVisibility);
      contrast.removeEventListener("change", size);
      systemLight.removeEventListener("change", size);
    };
}

export function AmbientVisualizer({ motion, theme }: { motion: boolean; theme: Theme }) {
  const start = useCallback(
    (canvas: HTMLCanvasElement | null) => (canvas ? startVisualizer(canvas, motion, theme) : undefined),
    [motion, theme],
  );
  return <canvas ref={start} className="ambient-visualizer" aria-hidden="true" />;
}
