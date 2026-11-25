export declare const colorNames: readonly ["background", "foreground", "card", "card-foreground", "popover", "popover-foreground", "primary", "primary-foreground", "secondary", "secondary-foreground", "muted", "muted-foreground", "accent", "accent-foreground", "destructive", "destructive-foreground", "border", "input", "ring", "ok", "warn", "info"];
type ColorName = (typeof colorNames)[number];
type Named = Record<string, string>;
/**
 * Beside the required colors, `color.light` may name a project palette (`lilac`, `glass` …); `color.dark` may
 * give any of them a dark value, and one it does not give keeps its light value.
 */
export interface Tokens {
    color: {
        light: Record<ColorName, string> & Named;
        dark: Record<ColorName, string> & Named;
    };
    radius: string;
    font: {
        sans: string;
        mono: string;
    } & Named;
    shadow: Named;
    /** Filter shadows that follow a shape's outline, such as an icon's or a speech tail's: `drop-shadow-<name>`. */
    dropShadow: Named;
    motion: {
        duration: Named;
        ease: Named;
    };
    breakpoint: Named;
    /** Named radii beside the derived `rounded-sm` … `rounded-xl`: `rounded-<name>`. */
    rounded: Named;
    /** Background images, usually gradients over palette colors: `bg-gradient-<name>`. */
    gradient: Named;
    /** Font sizes: `text-<name>`; the object form also sets its line height and letter spacing. */
    text: Record<string, string | TextSize>;
    /** Font weights: `font-<name>`, beside the families of `font`. */
    weight: Named;
    /** Line heights: `leading-<name>`. */
    leading: Named;
    /** Letter spacing: `tracking-<name>`. */
    tracking: Named;
    /** Stacking layers: `z-<name>`. */
    z: Named;
    /**
     * The keyboard focus ring of `:focus-visible`, 2px wide and 2px off the element unless given. `outline-focus` exists
     * only when `width` is declared, and `outline-offset-focus` only when `offset` is.
     */
    focus?: {
        width?: string;
        offset?: string;
    };
    /** Blur radii: `blur-<name>`, `backdrop-blur-<name>`. */
    blur: Named;
    /** Keyframe bodies by name, such as `"50%{opacity:0}"`, for `animate` to run. */
    keyframes: Named;
    /** Animations: `animate-<name>`, such as `"blink 1s step-end infinite"`. */
    animate: Named;
}
/** A font size with the line height and letter spacing that go with it, as Tailwind's `--text-<name>--line-height`. */
export interface TextSize {
    size: string;
    leading?: string;
    tracking?: string;
}
/** Tailwind v4's default palette (tailwindcss 4.3 theme.css): the colors of `bg-red-500` and the like. */
export declare const palette = "slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|mauve|olive|mist|taupe";
export declare const leaves: (value: unknown, path?: string) => [string, unknown][];
/** `input` as tokens: every leaf a known path holding a valid value, nothing missing. Throws with every problem. */
export declare function parseTokens(input: unknown): Tokens;
/** WCAG 2 contrast ratio of two oklch colors. */
export declare const contrast: (one: string, other: string) => number;
/** Every pair below WCAG AA, in both themes: 4.5:1 for text, 3:1 for a boundary. */
export declare const contrastIssues: (tokens: Tokens) => string[];
/** Validates changes (shape, existing path, value, AA contrast); returns the new tokens and a before/after diff, or throws. */
export declare function applyChanges(tokens: Tokens, input: unknown): {
    tokens: Tokens;
    diff: string;
};
export {};
