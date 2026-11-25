import { type Tokens } from "./tokens.ts";
export interface DesignNode {
    type: string;
    parent?: DesignNode;
    name?: {
        name?: string;
    };
    key?: {
        name?: string;
    };
}
export interface DesignContext {
    sourceCode: {
        getAllComments(): {
            value: string;
            loc?: object | null;
        }[];
    };
    report(problem: object): void;
}
/**
 * Flat-config entries that hold `.ts`/`.tsx` to the tokens. The caller passes the eslint-plugin-better-tailwindcss
 * module, the parsed tokens.json and the Tailwind entry (generated/theme.css), and configures its own parser.
 */
export declare function designSystem<Plugin>({ tailwind, tokens, entryPoint }: {
    tailwind: Plugin;
    tokens: Tokens;
    entryPoint: string;
}): ({
    files: string[];
    plugins: {
        "better-tailwindcss": Plugin;
        "design-system"?: undefined;
    };
    settings: {
        "better-tailwindcss": {
            entryPoint: string;
        };
    };
    rules: {
        "better-tailwindcss/no-unknown-classes": "error";
        "better-tailwindcss/no-conflicting-classes": "error";
        "better-tailwindcss/no-restricted-classes": ["error", object];
        "design-system/no-literal-colors"?: undefined;
    };
} | {
    files: string[];
    plugins: {
        "design-system": {
            rules: {
                "no-literal-colors": {
                    meta: {
                        type: "problem";
                        schema: never[];
                        messages: {
                            literal: string;
                            reason: string;
                        };
                    };
                    create(context: DesignContext): {
                        Program(): void;
                        Literal: (node: DesignNode & {
                            value?: unknown;
                        }) => void;
                        TemplateElement: (node: DesignNode & {
                            value: {
                                cooked?: string | null;
                            };
                        }) => void;
                    };
                };
            };
        };
        "better-tailwindcss"?: undefined;
    };
    rules: {
        "design-system/no-literal-colors": "error";
        "better-tailwindcss/no-unknown-classes"?: undefined;
        "better-tailwindcss/no-conflicting-classes"?: undefined;
        "better-tailwindcss/no-restricted-classes"?: undefined;
    };
    settings?: undefined;
})[];
