/**
 * `text` is gen/<name>.ts. A state machine gets `useMachine`, the one bridge from its `Machine` service to a
 * component: the state as the service publishes it, and `enabled` and `send` for what the component offers. A
 * library gets nothing.
 */
export declare function reactHook(name: string, source: string, text: string): string | undefined;
