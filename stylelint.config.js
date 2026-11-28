import { readFileSync } from "node:fs";
import { relative } from "node:path";
import stylelint from "stylelint";

const baseline = JSON.parse(readFileSync(new URL("./design-baseline.json", import.meta.url), "utf8"));
const literalRuleName = "sonnely/no-literal-colors";
const semanticRuleName = "sonnely/no-semantic-token-override";
const aliasRuleName = "sonnely/no-legacy-design-alias";

const hexColor = /#[0-9a-f]{3,8}\b/gi;
const colorFunction = /\b(?:rgb|rgba|hsl|hsla|hwb|lab|lch|oklab|oklch)\s*\(/gi;
const namedColors = "aliceblue antiquewhite aqua aquamarine azure beige bisque black blanchedalmond blue blueviolet brown burlywood cadetblue chartreuse chocolate coral cornflowerblue cornsilk crimson cyan darkblue darkcyan darkgoldenrod darkgray darkgreen darkgrey darkkhaki darkmagenta darkolivegreen darkorange darkorchid darkred darksalmon darkseagreen darkslateblue darkslategray darkslategrey darkturquoise darkviolet deeppink deepskyblue dimgray dimgrey dodgerblue firebrick floralwhite forestgreen fuchsia gainsboro ghostwhite gold goldenrod gray green greenyellow grey honeydew hotpink indianred indigo ivory khaki lavender lavenderblush lawngreen lemonchiffon lightblue lightcoral lightcyan lightgoldenrodyellow lightgray lightgreen lightgrey lightpink lightsalmon lightseagreen lightskyblue lightslategray lightslategrey lightsteelblue lightyellow lime limegreen linen magenta maroon mediumaquamarine mediumblue mediumorchid mediumpurple mediumseagreen mediumslateblue mediumspringgreen mediumturquoise mediumvioletred midnightblue mintcream mistyrose moccasin navajowhite navy oldlace olive olivedrab orange orangered orchid palegoldenrod palegreen paleturquoise palevioletred papayawhip peachpuff peru pink plum powderblue purple rebeccapurple red rosybrown royalblue saddlebrown salmon sandybrown seagreen seashell sienna silver skyblue slateblue slategray slategrey snow springgreen steelblue tan teal thistle tomato turquoise violet wheat white whitesmoke yellow yellowgreen".split(" ");
const namedColor = new RegExp(`(?<![\\w-])(?:${namedColors.join("|")})(?![\\w-])`, "gi");

function literalColorCount(value) {
  return (value.match(hexColor)?.length ?? 0) + (value.match(colorFunction)?.length ?? 0) + (value.match(namedColor)?.length ?? 0);
}

function fileName(root) {
  const file = root.source?.input.file;
  return file ? relative(process.cwd(), file).replaceAll("\\", "/") : "";
}

const literalRule = stylelint.createPlugin(literalRuleName, (enabled) => (root, result) => {
  if (enabled !== true) return;
  let count = 0;
  let first = null;
  root.walkDecls((decl) => {
    const literals = literalColorCount(decl.value);
    count += literals;
    if (!first && literals) first = decl;
  });
  const allowed = baseline.stylelint[literalRuleName][fileName(root)] ?? 0;
  if (count > allowed && first) {
    stylelint.utils.report({
      message: `${count} literal colors exceeds the baseline of ${allowed}; use semantic design tokens or lower the baseline by deleting existing literals`,
      node: first,
      result,
      ruleName: literalRuleName,
    });
  }
});

const semanticRoles = ["background", "foreground", "card", "card-foreground", "popover", "popover-foreground", "primary", "primary-foreground", "secondary", "secondary-foreground", "muted", "muted-foreground", "accent", "accent-foreground", "destructive", "destructive-foreground", "border", "input", "ring", "ok", "ok-foreground", "warn", "warn-foreground", "info", "info-foreground"];
const semanticProperty = new RegExp(`^--(?:${semanticRoles.join("|")})$`);
const semanticRule = stylelint.createPlugin(semanticRuleName, (enabled) => (root, result) => {
  if (enabled !== true) return;
  root.walkDecls((decl) => {
    if (!semanticProperty.test(decl.prop)) return;
    stylelint.utils.report({
      message: `Do not redefine semantic token ${decl.prop}; change packages/design-system/tokens.json instead`,
      node: decl,
      result,
      ruleName: semanticRuleName,
    });
  });
});

const legacyAliases = ["surface", "ink", "line", "action", "action-hover", "active-fill", "glass", "glass-solid", "raised", "rim", "shadow", "haze", "ease-out", "font", "mono", "serif", "control-edge", "focus-ring"];
const legacyAlias = new RegExp(`--(?:${legacyAliases.join("|")})(?![\\w-])`);
const aliasRule = stylelint.createPlugin(aliasRuleName, (enabled) => (root, result) => {
  if (enabled !== true) return;
  root.walkDecls((decl) => {
    if (!legacyAlias.test(decl.prop) && !legacyAlias.test(decl.value)) return;
    stylelint.utils.report({
      message: "Do not use the retired pre-vibestack design aliases; use the semantic token or documented effect token directly",
      node: decl,
      result,
      ruleName: aliasRuleName,
    });
  });
});

export default {
  extends: ["stylelint-config-standard"],
  plugins: [literalRule, semanticRule, aliasRule],
  ignoreFiles: [
    ".claude/**",
    "**/node_modules/**",
    "**/gen/**",
    "**/dist/**",
    "**/.cache/**",
    "**/.spec-cache/**",
    "**/generated/**",
    "**/storybook-static/**",
    "app/**",
    "components/**",
  ],
  rules: {
    "at-rule-no-unknown": [true, { ignoreAtRules: ["source"] }],
    "import-notation": "string",
    "at-rule-empty-line-before": [
      "always",
      {
        except: ["blockless-after-same-name-blockless", "first-nested"],
        ignore: ["after-comment"],
        ignoreAtRules: ["source"],
      },
    ],
    "sonnely/no-literal-colors": true,
    "sonnely/no-semantic-token-override": true,
    "sonnely/no-legacy-design-alias": true,
  },
};
