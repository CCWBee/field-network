'use client';

type BenchmarkMarkerSize = 'sm' | 'md' | 'lg';

interface BenchmarkMarkerProps {
  number?: string | number;
  size?: BenchmarkMarkerSize;
  className?: string;
}

const sizeConfig: Record<BenchmarkMarkerSize, {
  width: number;
  height: number;
  strokeWidth: number;
  fontSize: number;
}> = {
  sm: { width: 16, height: 16, strokeWidth: 1.5, fontSize: 6 },
  md: { width: 24, height: 24, strokeWidth: 2, fontSize: 8 },
  lg: { width: 32, height: 32, strokeWidth: 2, fontSize: 11 },
};

/**
 * BenchmarkMarker
 *
 * A small SVG component inspired by the Ordnance Survey benchmark symbol.
 * Renders an upward-pointing triangle with a horizontal bar at its base,
 * with an optional number displayed inside the triangle.
 *
 * The design echoes survey cut-marks found on buildings and trig points
 * across the British Isles -- a nod to Field Network's mapping heritage.
 */
function BenchmarkMarker({
  number,
  size = 'sm',
  className = '',
}: BenchmarkMarkerProps) {
  const { width, height, strokeWidth, fontSize } = sizeConfig[size];

  // Padding from edges so strokes aren't clipped
  const pad = strokeWidth;

  // Triangle vertices: apex at top-center, base corners at bottom
  const apex = { x: width / 2, y: pad };
  const bottomLeft = { x: pad, y: height - pad };
  const bottomRight = { x: width - pad, y: height - pad };

  const trianglePath = `M ${apex.x} ${apex.y} L ${bottomRight.x} ${bottomRight.y} L ${bottomLeft.x} ${bottomLeft.y} Z`;

  // Horizontal bar sits along the base of the triangle
  const barY = height - pad;

  // Number centroid -- slightly below geometric centre so it reads well inside the triangle
  const textX = width / 2;
  const textY = height * 0.62;

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden={!number}
      role={number ? 'img' : undefined}
      aria-label={number ? `Marker ${number}` : undefined}
    >
      {/* Triangle */}
      <path
        d={trianglePath}
        stroke="#0d9488"
        strokeWidth={strokeWidth}
        strokeLinejoin="round"
        strokeLinecap="round"
        fill="transparent"
      />

      {/* Horizontal bar at base */}
      <line
        x1={0}
        y1={barY}
        x2={width}
        y2={barY}
        stroke="#0d9488"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
      />

      {/* Optional number inside the triangle */}
      {number !== undefined && number !== null && (
        <text
          x={textX}
          y={textY}
          textAnchor="middle"
          dominantBaseline="central"
          fill="#0d9488"
          fontSize={fontSize}
          fontFamily="ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace"
          fontWeight={600}
        >
          {number}
        </text>
      )}
    </svg>
  );
}

export { BenchmarkMarker };
export type { BenchmarkMarkerProps, BenchmarkMarkerSize };
