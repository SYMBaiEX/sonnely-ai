/* eslint-disable better-tailwindcss/no-unknown-classes -- playground migration preserves the original form markup, class names and screen structure */
import { Download } from "lucide-react";
import { Streamdown } from "streamdown";
import { z } from "zod";
import type { Workload } from "./playground-inference.tsx";

const ranked = z.array(z.object({ index: z.number().int(), relevance_score: z.number() }));
const vectors = z.array(z.object({ index: z.number().int(), embedding: z.array(z.number()) }));
const decision = z.record(z.string(), z.object({ noul: z.number() }));

export function PlaygroundResultContent({
  endpoint,
  text,
  imageUrl,
  audioUrl,
  data,
  documents,
}: {
  endpoint: Workload;
  text?: string;
  imageUrl?: string;
  audioUrl?: string;
  data?: unknown;
  documents?: string[];
}) {
  if (imageUrl)
    return (
      <figure className="playground-artifact">
        <img src={imageUrl} alt="Generated output" />
        <figcaption>
          <span>PNG preview</span>
          <a className="button quiet small" download="sonnely-image.png" href={imageUrl}>
            <Download size={16} aria-hidden="true" /> Download image
          </a>
        </figcaption>
      </figure>
    );

  if (audioUrl)
    return (
      <div className="playground-audio-output">
        <audio controls src={audioUrl} aria-label="Synthesized speech" />
        <a className="button quiet small" download="sonnely-speech.wav" href={audioUrl}>
          <Download size={16} aria-hidden="true" /> Download WAV
        </a>
      </div>
    );

  if (endpoint === "responses" || endpoint === "convert/file")
    return (
      <div className="playground-markdown">
        <Streamdown mode="static" disallowedElements={["img", "video", "audio", "source", "iframe"]} controls={false}>
          {text ?? ""}
        </Streamdown>
      </div>
    );

  const ranks = endpoint === "rerank" ? ranked.safeParse(data) : null;
  const embeddings = endpoint === "embeddings" ? vectors.safeParse(data) : null;
  const answers = endpoint === "systemone" ? decision.safeParse(data) : null;
  if (ranks?.success || embeddings?.success || answers?.success) {
    return (
      <>
        {ranks?.success && (
          <ol className="playground-result-list" aria-label="Ranked documents">
            {ranks.data.map(({ index, relevance_score }) => (
              <li key={index}>
                <span>{documents?.[index] ?? `Document ${index + 1}`}</span>
                <strong>{relevance_score.toFixed(3)}</strong>
              </li>
            ))}
          </ol>
        )}
        {embeddings?.success && (
          <ul className="playground-result-list" aria-label="Embedding vectors">
            {embeddings.data.map(({ index, embedding }) => (
              <li key={index}>
                <span>Input {index + 1}</span>
                <strong>{embedding.length} dimensions</strong>
              </li>
            ))}
          </ul>
        )}
        {answers?.success && (
          <dl className="playground-result-list">
            {Object.entries(answers.data).map(([key, value]) => (
              <div key={key}>
                <dt>{key === "decision" ? "Decision score" : key}</dt>
                <dd>{value.noul.toFixed(3)}</dd>
              </div>
            ))}
          </dl>
        )}
        {text && (
          <details className="playground-raw-result">
            <summary>View raw JSON</summary>
            <pre tabIndex={0} aria-label="Raw response">
              {text}
            </pre>
          </details>
        )}
      </>
    );
  }

  return text ? <div className="playground-plain-result">{text}</div> : null;
}
