"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRight, ArrowUpRight } from "lucide-react";
import { models } from "@/lib/models";

export function ModelStrip() {
  const track = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ start: true, end: false });

  useEffect(() => {
    const element = track.current;
    if (!element) return;
    function update() {
      if (!element) return;
      setEdges({
        start: element.scrollLeft < 2,
        end: element.scrollLeft + element.clientWidth >= element.scrollWidth - 2,
      });
    }
    const observer = new ResizeObserver(update);
    observer.observe(element);
    element.addEventListener("scroll", update, { passive: true });
    update();
    return () => {
      observer.disconnect();
      element.removeEventListener("scroll", update);
    };
  }, []);

  function move(direction: number) {
    const element = track.current;
    const card = element?.firstElementChild;
    if (!element || !card) return;
    const gap = Number.parseFloat(getComputedStyle(element).columnGap) || 0;
    const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    element.scrollBy({
      left: direction * (card.clientWidth + gap),
      behavior: reduced ? "instant" : "smooth",
    });
  }

  return (
    <section className="section" aria-labelledby="model-strip-heading">
      <div className="section-head">
        <div>
          <p className="eyebrow">From the catalog</p>
          <h2 id="model-strip-heading">Choose your model.</h2>
        </div>
        <div className="actions strip-controls">
          <Link href="/models" className="text-link">
            Compare models <ArrowUpRight size={18} />
          </Link>
          <button
            className="icon-button"
            type="button"
            aria-label="Previous model"
            aria-controls="model-strip"
            disabled={edges.start}
            onClick={() => move(-1)}
          >
            <ArrowLeft size={18} />
          </button>
          <button
            className="icon-button"
            type="button"
            aria-label="Next model"
            aria-controls="model-strip"
            disabled={edges.end}
            onClick={() => move(1)}
          >
            <ArrowRight size={18} />
          </button>
        </div>
      </div>
      <div className="model-strip" id="model-strip" ref={track}>
        {models.map((model) => (
          <Link
            href={"/console?model=" + encodeURIComponent(model.id)}
            className="panel model-card feature-model"
            key={model.id}
          >
            <div className="between strip-card-top">
              <span className={"model-mark " + model.color}>{model.mark}</span>
              <span className="pill">{model.type}</span>
            </div>
            <div>
              <h3>{model.name}</h3>
              <p>{model.summary}</p>
            </div>
            <div className="between strip-card-meta">
              <span className="mono">{model.context} context</span>
              <span className="text-link">
                Open in chat <ArrowUpRight size={16} />
              </span>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}
