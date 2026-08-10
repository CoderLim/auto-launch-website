declare const process: { env: Record<string, string | undefined>; argv: string[]; cwd(): string; exitCode?: number };
declare module 'node:fs' {
  export function readFileSync(path: string, encoding: string): string;
  export function existsSync(path: string): boolean;
}
declare module 'node:fs/promises' {
  export function readFile(path: string, encoding: string): Promise<string>;
  export function writeFile(path: string, data: string): Promise<void>;
  export function mkdir(path: string, options?: unknown): Promise<unknown>;
  export function realpath(path: string): Promise<string>;
  export function stat(path: string): Promise<unknown>;
  export function access(path: string): Promise<void>;
}
declare module 'node:path' {
  export function resolve(...paths: string[]): string;
  export function join(...paths: string[]): string;
}
declare module 'node:os' {
  export function homedir(): string;
}
declare module 'node:crypto' {
  export function randomBytes(size: number): { toString(encoding: string): string };
}
type Child = {
  on(event: 'exit', cb: (code: number | null) => void): void;
  on(event: 'error', cb: (err: Error) => void): void;
  stdin?: { write(data: string): void; end(): void };
  stdout?: { on(event: 'data', cb: (d: string) => void): void };
  stderr?: { on(event: 'data', cb: (d: string) => void): void };
};declare module 'node:child_process' {
  export function spawn(command: string, options: unknown): Child;
  export function spawn(command: string, args: string[], options: unknown): Child;
  export function execFile(
    command: string,
    args: string[],
    options: { encoding: string },
    callback: (error: Error | null, stdout: string, stderr: string) => void,
  ): void;
}
declare module 'node:util' {
  export function promisify<T extends (...args: never[]) => unknown>(fn: T): (...args: unknown[]) => Promise<unknown>;
}
