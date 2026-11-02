/** Opt-in local report export: never silently overwrite existing data. */
import { open } from 'node:fs/promises';
import { resolve } from 'node:path';

export function validateReportPath(value) {
  if (typeof value !== 'string' || !value.trim() || value.startsWith('-') ||
      /[\\/]$/.test(value) || value.includes('\0')) {
    throw new Error('--output-file requires a nonempty file path.');
  }
  return value;
}

/** Create the report exclusively with owner-only permissions (no overwrite). */
export async function saveNewReportFile(filename, body) {
  const target = resolve(validateReportPath(filename));
  const file = await open(target, 'wx', 0o600);
  try {
    await file.writeFile(body, { encoding: 'utf8' });
  } finally {
    await file.close();
  }
  return target;
}
