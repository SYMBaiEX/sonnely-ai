"use client";

import { useState } from "react";
import { CircleCheck, Fingerprint, Radio, ReceiptText, Wallet } from "lucide-react";
import styles from "./product-pages.module.css";

const stages = [
  {
    name: "Reserve credits",
    start: 0,
    end: 96,
    icon: Wallet,
    detail: "Place a hold for the estimated request cost.",
  },
  {
    name: "Provider attempt",
    start: 96,
    end: 936,
    icon: Radio,
    detail: "Send the request to Phala and collect the completion and token usage.",
  },
  {
    name: "Verify evidence",
    start: 936,
    end: 1128,
    icon: Fingerprint,
    detail: "Check the evidence available for the provider route.",
  },
  {
    name: "Write settlement",
    start: 1128,
    end: 1200,
    icon: ReceiptText,
    detail: "Record the final usage charge and release the unused hold.",
  },
] as const;
const totalDuration = stages[stages.length - 1].end;

export function TracePreview() {
  const [active, setActive] = useState(1);
  const selected = stages[active];

  return (
    <figure className={styles.trace}>
      <figcaption>
        <span>
          <Radio size={17} aria-hidden="true" /> Example trace · Phala
        </span>
        <span className={styles.traceStatus}>
          <CircleCheck size={15} aria-hidden="true" /> Settled
        </span>
      </figcaption>
      <dl className={styles.traceMetrics}>
        <div>
          <dt>First token</dt>
          <dd>780 ms</dd>
        </div>
        <div>
          <dt>Gateway time</dt>
          <dd>1.2 s</dd>
        </div>
      </dl>
      <ol className={styles.waterfall}>
        {stages.map(({ name, start, end, icon: Icon }, index) => (
          <li key={name}>
            <button type="button" aria-pressed={active === index} onClick={() => setActive(index)}>
              <span className={styles.traceLabel}>
                <Icon size={16} aria-hidden="true" /> {name}
              </span>
              <span className={styles.traceTrack} aria-hidden="true">
                <span
                  style={{
                    insetInlineStart: (start / totalDuration) * 100 + "%",
                    width: ((end - start) / totalDuration) * 100 + "%",
                  }}
                />
              </span>
              <span className={styles.traceDuration}>{end - start} ms</span>
            </button>
          </li>
        ))}
      </ol>
      <div className={styles.traceDetail} aria-live="polite">
        <div>
          <strong>{selected.name}</strong>{" "}
          <span>
            {selected.start.toLocaleString("en-US")}–{selected.end.toLocaleString("en-US")} ms
          </span>
        </div>
        <p>{selected.detail}</p>
      </div>
    </figure>
  );
}
