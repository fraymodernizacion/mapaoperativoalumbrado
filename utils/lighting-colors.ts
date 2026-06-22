import type { TechnologyGroup } from '~/types/municipal';

export type LightingColorMode = 'technology' | 'power' | 'encendido';

export const lightingColorPalette = [
  '#0f4c81',
  '#d9480f',
  '#e67700',
  '#0f766e',
  '#6d28d9',
  '#be123c',
  '#0891b2',
  '#4d7c0f',
  '#c026d3',
  '#475569',
  '#2563eb',
  '#9333ea',
  '#15803d',
  '#b91c1c',
  '#0369a1',
  '#a16207'
];

export function colorForTechnologyGroup(group: TechnologyGroup) {
  switch (group) {
    case 'led':
      return '#0f4c81';
    case 'sodio':
      return '#d9480f';
    case 'bajo_consumo':
      return '#e67700';
    case 'gabinete':
      return '#64748b';
    default:
      return '#0ea5e9';
  }
}

export function colorForLegendValue(value: string, values: string[]) {
  const index = values.indexOf(value);
  return lightingColorPalette[(index >= 0 ? index : values.length) % lightingColorPalette.length];
}
