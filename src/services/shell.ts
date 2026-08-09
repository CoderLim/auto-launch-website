import { spawn } from 'node:child_process';
import { AppError } from '../utils/errors.js';
export function run(command: string, cwd = process.cwd(), extraEnv: Record<string,string> = {}): Promise<void> {
  if (!command.trim()) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const child = spawn(command, { cwd, shell: true, stdio: 'inherit', env: {...process.env, ...extraEnv} });
    child.on('exit', (code: number | null) => code === 0 ? resolve() : reject(new AppError(`Command failed (${code}): ${command}`, 'COMMAND_FAILED')));
    child.on('error', reject);
  });
}
