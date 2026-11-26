import { code as syntaxHighlighter, type HighlightOptions, type HighlightResult } from "@streamdown/code";
import { useCallback, useSyncExternalStore, type CSSProperties } from "react";
import { Streamdown, type PluginConfig, type StreamdownProps } from "streamdown";
import "streamdown/styles.css";

export type SyntaxLanguage = HighlightOptions["language"];
export type SyntaxLine = HighlightResult["tokens"][number];

const plugins = { code: syntaxHighlighter } satisfies PluginConfig;

export type MarkdownContentProps = StreamdownProps;

export function MarkdownContent(props: MarkdownContentProps) {
  return <Streamdown {...props} plugins={plugins} />;
}

type HighlightEntry = {
  listeners: Set<() => void>;
  requested: boolean;
  result: HighlightResult | null;
};

const highlightEntries = new Map<string, HighlightEntry>();
const highlightEntryLimit = 128;

function highlightKey(source: string, language: SyntaxLanguage) {
  return language + "\n" + source;
}

function entryFor(key: string) {
  const existing = highlightEntries.get(key);
  if (existing) return existing;
  const created: HighlightEntry = { listeners: new Set(), requested: false, result: null };
  highlightEntries.set(key, created);
  if (highlightEntries.size > highlightEntryLimit) {
    for (const [oldestKey, oldest] of highlightEntries) {
      if (oldest.listeners.size === 0) {
        highlightEntries.delete(oldestKey);
        break;
      }
    }
  }
  return created;
}

function requestHighlight(source: string, language: SyntaxLanguage, entry: HighlightEntry) {
  if (entry.requested) return;
  entry.requested = true;
  const publish = (result: HighlightResult) => {
    entry.result = result;
    for (const listener of entry.listeners) listener();
  };
  const immediate = syntaxHighlighter.highlight(
    { code: source, language, themes: syntaxHighlighter.getThemes() },
    publish,
  );
  if (immediate) publish(immediate);
}

function subscribeHighlight(source: string, language: SyntaxLanguage, listener: () => void) {
  const entry = entryFor(highlightKey(source, language));
  entry.listeners.add(listener);
  requestHighlight(source, language, entry);
  return () => {
    entry.listeners.delete(listener);
  };
}

function readHighlight(source: string, language: SyntaxLanguage) {
  return highlightEntries.get(highlightKey(source, language))?.result ?? null;
}

export function useSyntaxHighlight(source: string, language: SyntaxLanguage) {
  const subscribe = useCallback(
    (listener: () => void) => subscribeHighlight(source, language, listener),
    [source, language],
  );
  const getSnapshot = useCallback(() => readHighlight(source, language), [source, language]);
  return useSyncExternalStore(subscribe, getSnapshot, () => null);
}

type SyntaxTokenStyle = CSSProperties & {
  "--syntax-light"?: string;
  "--syntax-dark"?: string;
  "--syntax-light-bg"?: string;
  "--syntax-dark-bg"?: string;
};

function tokenStyle(token: SyntaxLine[number]): SyntaxTokenStyle {
  const htmlStyle = token.htmlStyle ?? {};
  const light = htmlStyle.color ?? token.color;
  const dark = htmlStyle["--shiki-dark"] ?? light;
  const lightBackground = htmlStyle["background-color"] ?? token.bgColor;
  const darkBackground = htmlStyle["--shiki-dark-bg"] ?? lightBackground;
  const style: SyntaxTokenStyle = {};
  if (light) style["--syntax-light"] = light;
  if (dark) style["--syntax-dark"] = dark;
  if (lightBackground) style["--syntax-light-bg"] = lightBackground;
  if (darkBackground) style["--syntax-dark-bg"] = darkBackground;
  return style;
}

export type SyntaxTokensProps = {
  line: SyntaxLine;
};

export function SyntaxTokens({ line }: SyntaxTokensProps) {
  return (
    <>
      {line.map((token) => (
        <span
          key={token.offset + token.content.length + token.content}
          className="bg-[var(--syntax-light-bg,transparent)] text-[var(--syntax-light,inherit)] dark:bg-[var(--syntax-dark-bg,var(--syntax-light-bg,transparent))] dark:text-[var(--syntax-dark,var(--syntax-light,inherit))]"
          style={tokenStyle(token)}
        >
          {token.content}
        </span>
      ))}
    </>
  );
}

function plainLines(source: string): SyntaxLine[] {
  let offset = 0;
  return source.split("\n").map((content) => {
    const line = [{ content, offset }];
    offset += content.length + 1;
    return line;
  });
}

export type HighlightedCodeProps = {
  source: string;
  language: SyntaxLanguage;
};

export function HighlightedCode({ source, language }: HighlightedCodeProps) {
  const highlighted = useSyntaxHighlight(source, language);
  const lines = highlighted?.tokens ?? plainLines(source);
  return (
    <code>
      {lines.map((line, index) => (
        // eslint-disable-next-line @eslint-react/no-array-index-key -- source lines never reorder
        <span key={index}>
          <SyntaxTokens line={line} />
          {index < lines.length - 1 ? "\n" : null}
        </span>
      ))}
    </code>
  );
}
