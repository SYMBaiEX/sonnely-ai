"use client";

import { useEffect, useRef, useState, type CSSProperties, type PointerEvent } from "react";
import Link from "next/link";
import { ArrowUpRight, Cpu, Play, Radio, RotateCcw, Square, Terminal } from "lucide-react";
import { Scene } from "./scene";

const points = [
  [12, 76],
  [25, 76],
  [32, 65],
  [48, 65],
  [55, 55],
  [65, 55],
  [74, 41],
  [85, 41],
] as const;
const track = `polygon(${[
  ...points.map(([x, y]) => `${x}% ${y}%`),
  ...[...points].reverse().map(([x, y]) => `${x}% calc(${y}% + 1.5px)`),
].join(", ")})`;

const steps = [
  {
    point: 0,
    label: "Your client",
    short: "Client",
    icon: Terminal,
    description: "Send a text request from the console or your OpenAI-compatible SDK over HTTPS.",
    link: "/docs#quickstart",
    action: "Integration guide",
  },
  {
    point: 3,
    label: "Sonnely gateway",
    short: "Gateway",
    icon: Radio,
    description:
      "Sonnely can read the prompt while forwarding it. The usage ledger records request metadata and charges.",
    link: "/docs#privacy",
    action: "Data handling",
  },
  {
    point: 7,
    label: "NEAR AI enclave",
    short: "Private TEE",
    icon: Cpu,
    description:
      "The model runs in NEAR AI’s hardware-isolated environment. NEAR AI publishes the attestation evidence.",
    link: "/docs#verification",
    action: "Attestation guide",
  },
] as const;

export function RequestPath() {
  const [active, setActive] = useState(0);
  const [tour, setTour] = useState<"idle" | "running" | "finished">("idle");
  const previous = useRef(0);
  const pulse = useRef<HTMLSpanElement>(null);
  const step = steps[active];
  const [x, y] = points[step.point];

  useEffect(() => {
    if (tour !== "running") return;
    const timer = window.setTimeout(() => {
      if (active < steps.length - 1) setActive(active + 1);
      else setTour("finished");
    }, 4000);
    return () => window.clearTimeout(timer);
  }, [active, tour]);

  useEffect(() => {
    const from = steps[previous.current].point;
    const to = steps[active].point;
    previous.current = active;
    if (from >= to || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const frames = points.slice(from, to + 1).map(([x, y]) => ({ left: `${x}%`, top: `${y}%`, opacity: 1 }));
    frames[0].opacity = 0;
    frames[frames.length - 1].opacity = 0;
    const animation = pulse.current?.animate(frames, {
      duration: 210 * (to - from),
      easing: "linear",
    });
    return () => animation?.cancel();
  }, [active]);

  function select(index: number) {
    setTour("idle");
    setActive(index);
  }

  function toggleTour() {
    if (tour === "running") {
      setTour("idle");
      return;
    }
    setActive(0);
    setTour("running");
  }

  function pan(event: PointerEvent<HTMLDivElement>) {
    if (event.pointerType !== "mouse") return;
    const stage = event.currentTarget;
    const bounds = stage.getBoundingClientRect();
    stage.style.setProperty(
      "--landscape-x",
      `${(0.5 - (event.clientX - bounds.left) / bounds.width) * 16}px`,
    );
    stage.style.setProperty(
      "--landscape-y",
      `${(0.5 - (event.clientY - bounds.top) / bounds.height) * 12}px`,
    );
  }

  return (
    <section className="request-landscape" id="request-path" aria-labelledby="request-path-title">
      <div
        className="request-stage"
        data-step={active}
        style={
          {
            "--route-shape": track,
            "--track-remaining": `${100 - x}%`,
            "--station-x": `${x}%`,
            "--station-y": `${y}%`,
          } as CSSProperties
        }
        onPointerMove={pan}
        onPointerLeave={(event) => {
          event.currentTarget.style.removeProperty("--landscape-x");
          event.currentTarget.style.removeProperty("--landscape-y");
        }}
      >
        <div role="img" aria-label="Illustration of a Japanese forest village">
          <Scene variant="hero" />
        </div>
        <div className="request-track" aria-hidden="true">
          <div className="request-track-line" />
          <div className="request-track-progress">
            <div className="request-track-line" />
          </div>
          <span className="request-pulse" ref={pulse} />
        </div>
        <div className="request-stations" role="group" aria-labelledby="request-path-title">
          {steps.map(({ point, label, short, icon: Icon }, index) => (
            <button
              type="button"
              className="request-station"
              key={label}
              style={{ left: `${points[point][0]}%`, top: `${points[point][1]}%` }}
              aria-label={label}
              aria-pressed={active === index}
              aria-controls="request-path-detail"
              onClick={() => select(index)}
            >
              <span className="request-station-icon">
                <Icon size={16} aria-hidden="true" />
              </span>
              <span className="request-station-label">{short}</span>
            </button>
          ))}
        </div>
      </div>
      <div className="request-caption">
        <div className="request-caption-heading">
          <h2 id="request-path-title">Follow the request</h2>
          <span className="request-step-count">
            Step {active + 1} of {steps.length}
          </span>
        </div>
        <div id="request-path-detail" aria-live="polite" aria-atomic="true">
          <p key={step.label}>
            <strong>{step.label}.</strong> {step.description}
          </p>
        </div>
        <div className="request-caption-actions">
          <Link href={step.link} className="text-link">
            {step.action} <ArrowUpRight size={15} />
          </Link>
          <button type="button" className="button quiet request-tour-button" onClick={toggleTour}>
            {tour === "running" ? (
              <Square size={14} />
            ) : tour === "finished" ? (
              <RotateCcw size={15} />
            ) : (
              <Play size={15} />
            )}
            {tour === "running" ? "Stop trace" : tour === "finished" ? "Replay trace" : "Trace request"}
          </button>
        </div>
      </div>
    </section>
  );
}
