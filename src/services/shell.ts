import { spawn } from 'node:child_process';
import { AppError } from '../utils/errors.js';

export function run(command: string, cwd = process.cwd(), extraEnv: Record<string, string> = {}): Promise<void> {
  if (!command.trim()) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const child = spawn(command, {
      cwd,
      shell: true,
      stdio: 'inherit',
      env: { ...process.env, ...extraEnv },
    });
    child.on('exit', (code: number | null) =>
      code === 0 ? resolve() : reject(new AppError(`Command failed (${code}): ${command}`, 'COMMAND_FAILED')),
    );
    child.on('error', reject);
  });
}

export function runCapture(
  command: string,
  cwd = process.cwd(),
  extraEnv: Record<string, string> = {},
): Promise<{ stdout: string; stderr: string; code: number }> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, {
      cwd,
      shell: true,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, ...extraEnv },
    });
    let stdout = '';
    let stderr = '';
    child.stdout?.on('data', (d: string) => {
      stdout += String(d);
    });
    child.stderr?.on('data', (d: string) => {
      stderr += String(d);
    });
    child.on('exit', (code: number | null) => resolve({ stdout, stderr, code: code ?? 1 }));
    child.on('error', reject);
  });
}

export function runWithStdin(
  command: string,
  stdin: string,
  cwd = process.cwd(),
  extraEnv: Record<string, string> = {},
): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, {
      cwd,
      shell: true,
      stdio: ['pipe', 'inherit', 'inherit'],
      env: { ...process.env, ...extraEnv },
    });
    child.stdin?.write(stdin);
    child.stdin?.end();
    child.on('exit', (code: number | null) =>
      code === 0 ? resolve() : reject(new AppError(`Command failed (${code}): ${command}`, 'COMMAND_FAILED')),
    );
    child.on('error', reject);
  });
}
