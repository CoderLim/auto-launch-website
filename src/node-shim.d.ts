declare const process: { env: Record<string, string | undefined>; argv: string[]; cwd(): string; exitCode?: number };
declare module 'node:fs/promises' { export function readFile(path: string, encoding: string): Promise<string>; export function writeFile(path: string, data: string): Promise<void>; }
declare module 'node:path' { export function resolve(...paths: string[]): string; }
declare module 'node:child_process' { export function spawn(command: string, options: unknown): { on(event: 'exit', cb: (code: number | null) => void): void; on(event: 'error', cb: (err: Error) => void): void; }; }
