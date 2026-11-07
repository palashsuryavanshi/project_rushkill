import { KillfeedEntry } from './types';

/** Render a killfeed line as `A killed B`, omitting the weapon badge. */
export function formatKillfeed(entry: Pick<KillfeedEntry, 'killer' | 'victim'>): string {
  return `${entry.killer} killed ${entry.victim}`;
}
