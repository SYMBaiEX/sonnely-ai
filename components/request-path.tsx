"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import Link from "next/link";
import { ArrowUpRight, Cpu, Pause, Play, Radio, Terminal } from "lucide-react";
import { useAmbientMotion } from "./ambient-motion";
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
    link: "/docs/quickstart",
    action: "Integration guide",
  },
  {
    point: 3,
    label: "Sonnely gateway",
    short: "Gateway",
    icon: Radio,
    description:
      "Sonnely can read the prompt while forwarding it. The usage ledger records request metadata and charges.",
    link: "/docs/attestation#data-handling",
    action: "Data handling",
  },
  {
    point: 7,
    label: "NEAR AI enclave",
    short: "Private TEE",
    icon: Cpu,
    description:
      "The model runs in NEAR AI’s hardware-isolated environment. NEAR AI publishes the attestation evidence.",
    link: "/docs/attestation",
    action: "Attestation guide",
  },
] as const;

export function RequestPath() {
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);
  const motion = useAmbientMotion();
  const map = useRef<HTMLElement>(null);
  const looping = motion && !paused;
  const previous = useRef(0);
  const pulse = useRef<HTMLSpanElement>(null);
  const step = steps[active];
  const [x, y] = points[step.point];

  useEffect(() => {
    const element = map.current;
    if (!looping || !element) return;
    let visible = false;
    let timer = 0;

    function sync() {
      window.clearInterval(timer);
      if (visible && !document.hidden) {
        timer = window.setInterval(() => setActive((step) => (step + 1) % steps.length), 3600);
      }
    }

    const observer = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      sync();
    });
    observer.observe(element);
    document.addEventListener("visibilitychange", sync);
    return () => {
      observer.disconnect();
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", sync);
    };
  }, [looping]);

  useEffect(() => {
    const from = steps[previous.current].point;
    const to = steps[active].point;
    previous.current = active;
    if (!motion || from === to) return;
    const path = from < to ? points.slice(from, to + 1) : points.slice(to, from + 1).reverse();
    const frames = path.map(([x, y]) => ({ left: `${x}%`, top: `${y}%`, opacity: 1 }));
    frames[0].opacity = 0;
    frames[frames.length - 1].opacity = 0;
    const animation = pulse.current?.animate(frames, {
      duration: 185 * Math.abs(to - from),
      easing: "linear",
    });
    return () => animation?.cancel();
  }, [active, motion]);

  function select(index: number) {
    setPaused(true);
    setActive(index);
  }

  return (
    <section ref={map} className="request-landscape" id="request-path" aria-labelledby="request-path-title">
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
        <div className="request-caption-copy">
          <div className="request-caption-measure" aria-hidden="true">
            {steps.map(({ label, description }) => (
              <p key={label}>
                <strong>{label}.</strong> {description}
              </p>
            ))}
          </div>
          <div id="request-path-detail" aria-live={looping ? "off" : "polite"} aria-atomic="true">
            <p key={step.label}>
              <strong>{step.label}.</strong> {step.description}
            </p>
          </div>
        </div>
        <div className="request-caption-actions">
          <Link href={step.link} className="text-link">
            <span>{step.action}</span> <ArrowUpRight size={15} />
          </Link>
          <button
            type="button"
            className="button quiet request-tour-button"
            disabled={!motion}
            onClick={() => setPaused(!paused)}
          >
            {looping ? <Pause size={15} /> : <Play size={15} />}
            {!motion ? "Motion off" : looping ? "Pause trace" : "Resume trace"}
          </button>
        </div>
      </div>
    </section>
  );
}
