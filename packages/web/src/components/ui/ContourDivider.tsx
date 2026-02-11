import React from 'react';

export type ContourVariant = 'gentle' | 'ridge' | 'valley';

export interface ContourDividerProps {
  /** Additional CSS classes for the wrapper */
  className?: string;
  /** Stroke color — maps to the project color tokens */
  color?: 'ink-200' | 'ink-100' | 'field-500';
  /** Stroke opacity (0-1) */
  opacity?: number;
  /** Contour shape variant */
  variant?: ContourVariant;
}

const COLOR_MAP: Record<string, string> = {
  'ink-200': '#cbd5e1',
  'ink-100': '#e2e8f0',
  'field-500': '#0d9488',
};

/**
 * Builds the SVG path `d` attribute for each contour variant.
 *
 * The viewBox is 1200 x 24, so the vertical center is y = 12.
 * All curves are cubic Beziers drawn with stroke only (no fill).
 */
function getPath(variant: ContourVariant): string {
  switch (variant) {
    // Gentle: a single subtle sine-like wave, 3-5px deviation from center (y 12)
    case 'gentle':
      return [
        'M 0 12',
        'C 150 8, 300 16, 450 12',
        'C 600 8, 750 15, 900 12',
        'C 1000 9, 1100 14, 1200 12',
      ].join(' ');

    // Ridge: more pronounced undulations, 7-10px amplitude
    case 'ridge':
      return [
        'M 0 14',
        'C 100 4, 250 4, 400 12',
        'C 500 18, 600 5, 750 10',
        'C 850 15, 1000 3, 1200 12',
      ].join(' ');

    // Valley: dips down between sections like a topographic valley
    case 'valley':
      return [
        'M 0 8',
        'C 150 10, 300 20, 500 20',
        'C 650 20, 800 18, 900 14',
        'C 1000 10, 1100 8, 1200 8',
      ].join(' ');
  }
}

/**
 * ContourDivider
 *
 * Renders a subtle, organic SVG contour-line curve intended to replace
 * straight `border-t` dividers between page sections.
 *
 * The SVG is fully responsive — it stretches to fill its container width
 * while maintaining a fixed height via `viewBox` + `preserveAspectRatio="none"`.
 */
export function ContourDivider({
  className = '',
  color = 'ink-200',
  opacity = 0.4,
  variant = 'gentle',
}: ContourDividerProps) {
  const stroke = COLOR_MAP[color] ?? COLOR_MAP['ink-200'];
  const d = getPath(variant);

  return (
    <div className={`w-full overflow-hidden ${className}`} aria-hidden="true">
      <svg
        viewBox="0 0 1200 24"
        preserveAspectRatio="none"
        className="w-full"
        style={{ height: 24, display: 'block' }}
        xmlns="http://www.w3.org/2000/svg"
      >
        <path
          d={d}
          fill="none"
          stroke={stroke}
          strokeWidth={1.5}
          strokeLinecap="round"
          opacity={opacity}
        />
      </svg>
    </div>
  );
}
