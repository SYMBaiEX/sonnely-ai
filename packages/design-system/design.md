# Design system

One accent on quiet neutrals. Color carries meaning; position and weight carry hierarchy.

- **Surfaces.** `background` is the page, `card` a raised panel, `popover` anything floating. `muted` and
  `secondary` are quiet fills, `accent` the hover and selection fill.
- **Text.** `foreground` by default, `muted-foreground` for what matters less. Every `x-foreground` is
  the text color on `x`, and each pair meets WCAG AA in both themes.
- **Edges.** `border` divides and may be faint. `input` is the edge of a control (a field, a checkbox, an
  outlined button): it and the focus `ring` stand at least 3:1 off `background` and `card` in both
  themes (WCAG 1.4.11).
- **Meaning.** `primary` is the one accent: the main action, links, the focus `ring`. `destructive`,
  `ok`, `warn` and `info` are states, never decoration.
- **Shape.** One `radius`; `rounded-sm`, `-md`, `-lg` and `-xl` derive from it. Three shadows, by elevation.
- **Motion.** `fast` for hover and press, `base` for most changes, `slow` for entering and leaving.
- **Dark.** Follows the system; a `.dark` or `.light` class on an ancestor overrides it.

Name a value by its token (`bg-primary`, `var(--primary)`), never by its value. Where a literal color
is unavoidable, such as a chart series or third-party markup, say why on the line above:
`// eslint-disable-next-line design-system/no-literal-colors -- chart series`.

## Changing it

`tokens.json` is the source; the CSS in `generated/` and the table below are built from it. Nothing reads
this prose into tokens. To change the design, describe it, and have the change written as a list in a file:

```json
[{ "path": "color.light.primary", "value": "oklch(0.45 0.2 277)", "reason": "deeper accent" }]
```

- `pnpm exec spec tokens apply changes.json` refuses an unknown path, an invalid value or a
  pair below AA, and prints each token before and after.
- The same with `--write` updates `tokens.json`, the CSS and the table.
- `pnpm build` regenerates; `pnpm check` fails on invalid tokens, low contrast or a stale table.

<!-- tokens:start -->
| Color | Light | Dark |
| --- | --- | --- |
| `background` | oklch(0.957 0.014 277.1) | oklch(0.152 0.007 300.8) |
| `foreground` | oklch(0.225 0.046 271.3) | oklch(0.979 0.004 337.4) |
| `card` | oklch(0.986 0.007 277.2) | oklch(0.209 0.01 303.6) |
| `card-foreground` | oklch(0.225 0.046 271.3) | oklch(0.979 0.004 337.4) |
| `popover` | oklch(0.983 0.008 278.6) | oklch(0.233 0.019 314.4) |
| `popover-foreground` | oklch(0.225 0.046 271.3) | oklch(0.979 0.004 337.4) |
| `primary` | oklch(0.459 0.202 267.6) | oklch(0.548 0.204 22.7) |
| `primary-foreground` | oklch(1 0 0) | oklch(0.979 0.004 337.4) |
| `secondary` | oklch(0.936 0.022 274.7) | oklch(0.265 0.016 312.9) |
| `secondary-foreground` | oklch(0.225 0.046 271.3) | oklch(0.979 0.004 337.4) |
| `muted` | oklch(0.936 0.022 274.7) | oklch(0.265 0.016 312.9) |
| `muted-foreground` | oklch(0.47 0.042 269.3) | oklch(0.778 0.02 317.7) |
| `accent` | oklch(0.93 0.033 272.8) | oklch(0.29 0.058 0.1) |
| `accent-foreground` | oklch(0.225 0.046 271.3) | oklch(0.979 0.004 337.4) |
| `destructive` | oklch(0.548 0.204 22.7) | oklch(0.68 0.209 20.6) |
| `destructive-foreground` | oklch(1 0 0) | oklch(0.152 0.007 300.8) |
| `border` | oklch(0.865 0.03 271.1) | oklch(0.338 0.022 316.8) |
| `input` | oklch(0.621 0.043 269.2) | oklch(0.566 0.03 318.2) |
| `ring` | oklch(0.448 0.202 266.9) | oklch(0.756 0.148 14.6) |
| `ok` | oklch(0.527 0.137 150.1) | oklch(0.8 0.182 151.7) |
| `warn` | oklch(0.555 0.146 49) | oklch(0.837 0.164 84.4) |
| `info` | oklch(0.5 0.13 255) | oklch(0.82 0.09 253) |

| Token | Value |
| --- | --- |
| `radius` | 0.9375rem |
| `font.sans` | "Geist Variable", Inter, system-ui, sans-serif |
| `font.serif` | "Instrument Serif", Georgia, serif |
| `font.mono` | "Geist Mono Variable", ui-monospace, monospace |
| `shadow.sm` | 0 1px 2px rgb(26 38 94 / 8%) |
| `shadow.md` | 0 4px 12px rgb(26 38 94 / 12%) |
| `shadow.lg` | 0 12px 32px rgb(26 38 94 / 18%) |
| `breakpoint.sm` | 40rem |
| `breakpoint.md` | 48rem |
| `breakpoint.lg` | 64rem |
| `breakpoint.xl` | 80rem |
| `duration.fast` | 100ms |
| `duration.base` | 150ms |
| `duration.slow` | 300ms |
| `ease.standard` | cubic-bezier(0.22, 1, 0.36, 1) |
<!-- tokens:end -->
