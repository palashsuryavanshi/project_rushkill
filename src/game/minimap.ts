/**
 * Metre-space geometry for the Afterglow radar.
 *
 * The SVG viewBox is authored directly in world metres: x maps to world x and
 * y maps to world z, with bow (negative z) at the top. Nothing here is a
 * percentage of the panel, so a blip sits where the player actually stands.
 * Deck height is deliberately not encoded: every deck shares the same x/z
 * footprint.
 */

export const MINIMAP_VIEW = { x: -12.2, y: -54, width: 24.4, height: 108 };

/** Hull outline in metres, tapering at the bow (negative y). */
export const HULL_PATH =
  'M 0 -54 L 11.4 -46 L 12.2 -38 L 12.2 52 Q 12.2 54 10.2 54 L -10.2 54 Q -12.2 54 -12.2 52 L -12.2 -38 L -11.4 -46 Z';

export interface MapZone {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Five lengthwise zones that tile the hull from bow deck to stern deck. */
export const MAP_ZONES: ReadonlyArray<MapZone> = [
  { id: 'bow-deck', x: -12.2, y: -54, width: 24.4, height: 18 },
  { id: 'bow-cabin', x: -12.2, y: -36, width: 24.4, height: 18 },
  { id: 'centre', x: -12.2, y: -18, width: 24.4, height: 36 },
  { id: 'stern-cabin', x: -12.2, y: 18, width: 24.4, height: 18 },
  { id: 'stern-deck', x: -12.2, y: 36, width: 24.4, height: 18 },
];

export interface MapFeature {
  id: string;
  kind: 'rect' | 'circle';
  x: number;
  y: number;
  width?: number;
  height?: number;
  radius?: number;
}

/** Landmarks on the main deck, in metres. */
export const MAP_FEATURES: ReadonlyArray<MapFeature> = [
  { id: 'pool', kind: 'rect', x: -7.8, y: -6.6, width: 4.6, height: 13.2 },
  { id: 'lounge', kind: 'rect', x: 2.8, y: -7, width: 5.4, height: 14 },
  { id: 'planter', kind: 'rect', x: -1.4, y: -3, width: 2.8, height: 6 },
  { id: 'helipad', kind: 'circle', x: 0, y: -45, radius: 5 },
  { id: 'jacuzzi', kind: 'rect', x: -2.6, y: 47.4, width: 5.2, height: 5.2 },
];

/**
 * World position to minimap coordinates. The mapping is identity because the
 * viewBox is already in metres; keeping it as a function gives callers one
 * place to change if the map orientation ever shifts.
 */
export function projectToMap(x: number, z: number): { x: number; y: number } {
  return { x, y: z };
}

/**
 * Yaw to SVG rotation in degrees. Positive yaw turns the player left, which is
 * counter-clockwise on a bow-up map where SVG y grows toward the stern, so the
 * sign is inverted. The result is normalised into (-180, 180].
 */
export function playerRotationDeg(yaw: number): number {
  const deg = (-yaw * 180) / Math.PI;
  return ((((deg + 180) % 360) + 360) % 360) - 180;
}
