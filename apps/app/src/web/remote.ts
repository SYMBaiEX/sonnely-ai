import { useCallback, useEffect, useState } from "react";

export interface Remote<T> {
  /** The machine's state as the server last sent it; undefined until the first answer. */
  state: T | undefined;
  /** Send one event; resolves with whether the machine's rules allowed it. */
  send(input: unknown): Promise<boolean>;
  /** The last transport or rule failure. */
  error: string | undefined;
}

const base = (name: string) => `/api/machines/${name}`;

/** One spec machine kept by the server: its state, and a way to send it events. */
export function useRemote<T>(name: string): Remote<T> {
  const [state, setState] = useState<T>();
  const [error, setError] = useState<string>();

  useEffect(() => {
    const source = new EventSource(`${base(name)}/stream`);
    source.onmessage = (message) => setState(JSON.parse(String(message.data)) as T);
    source.onerror = () => setError("stream disconnected");
    return () => source.close();
  }, [name]);

  const send = useCallback(
    async (input: unknown) => {
      const response = await fetch(base(name), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(input),
      });
      const answer = (await response.json()) as { ok: boolean; error?: string };
      if (!answer.ok) setError(answer.error);
      return answer.ok;
    },
    [name],
  );

  return { state, send, error };
}
