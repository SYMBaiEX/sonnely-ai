"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";
import { AudioLines } from "lucide-react";
import type { Theme } from "@/lib/appearance";

const key = "sonnely.ambient-motion";
const change = "sonnely:ambient-motion";
const reducedQuery = "(prefers-reduced-motion: reduce)";
let paused = false;

function subscribe(update: () => void) {
  const media = matchMedia(reducedQuery);
  media.addEventListener("change", update);
  window.addEventListener("storage", update);
  window.addEventListener(change, update);
  return () => {
    media.removeEventListener("change", update);
    window.removeEventListener("storage", update);
    window.removeEventListener(change, update);
  };
}

const reduced = () => matchMedia(reducedQuery).matches;

function enabled() {
  if (reduced()) return false;
  try {
    return !(localStorage.getItem(key) === "off");
  } catch {
    return !paused;
  }
}

export function useAmbientMotion() {
  return useSyncExternalStore(subscribe, enabled, () => true);
}

export function MotionSwitch({ icon = false }: { icon?: boolean }) {
  const motion = useAmbientMotion();
  const systemReduced = useSyncExternalStore(subscribe, reduced, () => false);

  function toggle() {
    paused = motion;
    try {
      localStorage.setItem(key, paused ? "off" : "on");
    } catch {
      // In-memory choice still applies when browser storage is blocked.
    }
    window.dispatchEvent(new Event(change));
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

export function AmbientVisualizer({ motion, theme }: { motion: boolean; theme: Theme }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;
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
    let direction = 1;
    let tint = "";

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
      queue();
    }

    function onScroll() {
      const next = window.scrollY;
      direction = Math.sign(next - scrollPosition) || direction;
      scrollPosition = next;
      lastScroll = performance.now();
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
      lastPaint = now;
      const scroll = window.scrollY;
      const top = unit(1 - scroll / (height * 0.94)) ** 1.45;
      const movement = unit(1 - (now - lastScroll) / 660) ** 1.65;
      const footerBounds = footer?.getBoundingClientRect();
      const footerTop = footerBounds?.top ?? height;
      const footerVisible = unit((height - footerTop) / Math.max(1, footerBounds?.height ?? 1));
      const bass = footerVisible * (1 - movement * 0.79);

      ctx.clearRect(0, 0, width, height);
      if (top < 0.012 && movement < 0.012 && bass < 0.012) return;

      const step = width < 600 ? 5 : 7;
      const dot = width < 600 ? 1.15 : 1.45;
      const margin = Math.min(138, width * 0.15);
      const time = now / 1000;
      const crest = ((time * 67 + height * 0.29) % (height + 380)) - 95;
      const footerDepth = Math.min(118, height - footerTop);
      const columns = Array.from({ length: Math.ceil((width - 2) / step) }, (_, col) => {
        const x = 2 + col * step;
        const edge = unit(1 - Math.min(x, width - x) / margin);
        const fold =
          Math.sin((x / width) * 7.4 + time * 0.48) * 71 + Math.sin((x / width) * 18 - time * 0.76) * 27;
        const footerWave = 0.5 + 0.5 * Math.sin(x * 0.012 - time * 1.1);
        const spectrum = 0.5 + 0.5 * Math.sin(x * 0.053 + time * 2 + footerWave);
        const barHeight = Math.max(1, footerDepth * (0.16 + footerWave * 0.34 + spectrum * 0.39));
        return { x, edge, fold, barHeight, side: movement * edge ** 1.55 };
      });
      const tones = [new Path2D(), new Path2D(), new Path2D()];
      for (let y = 2, row = 0; y < height; y += step, row++) {
        const upper = top * unit(1 - y / (height * 0.82)) ** 1.1;
        const base = y >= footerTop ? bass : 0;
        if (upper + base + movement < 0.045) continue;
        for (let col = 0; col < columns.length; col++) {
          const { x, edge, fold, barHeight, side } = columns[col];
          if (upper + base + side < 0.045) continue;
          const distance = y - crest + fold;
          const phase = ((distance % 350) + 350) % 350;
          const ribbon = unit(1 - Math.min(phase, 350 - phase) / 105) ** 1.7;
          const echo = unit(1 - Math.abs(phase - 104) / 62) ** 2;
          const topSignal = upper * (0.09 + ribbon * 1.06 + echo * 0.46);
          const edgeBeat = Math.sin(y * 0.048 - time * 6 * direction + edge * 5) * 0.5 + 0.5;
          const sideSignal = side * (0.08 + 0.86 * edgeBeat ** 2.5);
          const floorSignal = base * unit(1 - (height - y) / barHeight) * (0.41 + 0.51 * edge);
          const strength = Math.max(topSignal, sideSignal, floorSignal);
          if (strength < (bayer[(row % 4) * 4 + (col % 4)] + 1) / 19) continue;
          const tone = strength > 0.62 ? 2 : strength > 0.32 ? 1 : 0;
          tones[tone].rect(x, y, dot + tone * 0.25, dot + tone * 0.25);
        }
      }
      ctx.fillStyle = tint;
      tones.forEach((tone, index) => {
        ctx.globalAlpha = [0.14, 0.3, 0.54][index];
        ctx.fill(tone);
      });
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
  }, [motion, theme]);

  return <canvas ref={ref} className="ambient-visualizer" aria-hidden="true" />;
}
