'use client';

import { useRef, useCallback, useId } from 'react';

interface BearingInputProps {
  value: number; // 0-360
  onChange: (degrees: number) => void;
  tolerance?: number; // optional, shows cone
  size?: number; // default 160px
  disabled?: boolean;
  label?: string;
  targetBearing?: number; // optional secondary marker (e.g. requested target)
}

const CARDINALS = [
  { label: 'N', deg: 0 },
  { label: 'NE', deg: 45 },
  { label: 'E', deg: 90 },
  { label: 'SE', deg: 135 },
  { label: 'S', deg: 180 },
  { label: 'SW', deg: 225 },
  { label: 'W', deg: 270 },
  { label: 'NW', deg: 315 },
];

function cardinalName(deg: number): string {
  const names = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
  const idx = Math.round(((deg % 360) / 22.5)) % 16;
  return names[idx];
}

function polar(cx: number, cy: number, r: number, deg: number) {
  const rad = ((deg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

function arcPath(cx: number, cy: number, r: number, startDeg: number, endDeg: number) {
  const start = polar(cx, cy, r, endDeg);
  const end = polar(cx, cy, r, startDeg);
  let sweep = endDeg - startDeg;
  if (sweep < 0) sweep += 360;
  const largeArc = sweep > 180 ? 1 : 0;
  return `M ${cx} ${cy} L ${start.x} ${start.y} A ${r} ${r} 0 ${largeArc} 0 ${end.x} ${end.y} Z`;
}

export default function BearingInput({
  value,
  onChange,
  tolerance,
  size = 160,
  disabled = false,
  label,
  targetBearing,
}: BearingInputProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const draggingRef = useRef(false);
  const inputId = useId();

  const cx = size / 2;
  const cy = size / 2;
  const r = size / 2 - 10;

  const normalized = ((Math.round(value) % 360) + 360) % 360;

  const angleFromEvent = useCallback((clientX: number, clientY: number) => {
    const svg = svgRef.current;
    if (!svg) return null;
    const rect = svg.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const dx = clientX - centerX;
    const dy = clientY - centerY;
    const rad = Math.atan2(dx, -dy);
    return ((rad * 180) / Math.PI + 360) % 360;
  }, []);

  const handlePointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    if (disabled) return;
    draggingRef.current = true;
    (e.target as Element).setPointerCapture?.(e.pointerId);
    const deg = angleFromEvent(e.clientX, e.clientY);
    if (deg != null) onChange(Math.round(deg));
  };

  const handlePointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!draggingRef.current || disabled) return;
    const deg = angleFromEvent(e.clientX, e.clientY);
    if (deg != null) onChange(Math.round(deg));
  };

  const handlePointerUp = (e: React.PointerEvent<SVGSVGElement>) => {
    draggingRef.current = false;
    (e.target as Element).releasePointerCapture?.(e.pointerId);
  };

  const pointer = polar(cx, cy, r - 8, normalized);

  // Tolerance cone
  let conePath: string | null = null;
  if (tolerance != null && tolerance > 0) {
    const center = targetBearing != null ? targetBearing : normalized;
    const start = (center - tolerance + 360) % 360;
    const end = (center + tolerance + 360) % 360;
    conePath = arcPath(cx, cy, r - 4, start, end);
  }

  let targetMarker: { x: number; y: number } | null = null;
  if (targetBearing != null) {
    targetMarker = polar(cx, cy, r - 8, targetBearing);
  }

  return (
    <div className="inline-flex flex-col items-center">
      {label && (
        <label htmlFor={inputId} className="block text-xs uppercase tracking-wider text-ink-500 mb-2 self-start">
          {label}
        </label>
      )}
      <svg
        ref={svgRef}
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        role="slider"
        aria-label={label || 'Bearing'}
        aria-valuemin={0}
        aria-valuemax={360}
        aria-valuenow={normalized}
        tabIndex={disabled ? -1 : 0}
        onKeyDown={(e) => {
          if (disabled) return;
          if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
            e.preventDefault();
            onChange((normalized + 1) % 360);
          } else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
            e.preventDefault();
            onChange((normalized - 1 + 360) % 360);
          }
        }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        className={`touch-none select-none ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
        style={{ touchAction: 'none' }}
      >
        {/* Outer circle */}
        <circle cx={cx} cy={cy} r={r} fill="white" stroke="#d1d5db" strokeWidth={1.5} />

        {/* Tolerance cone */}
        {conePath && (
          <path d={conePath} fill="#14b8a6" fillOpacity={0.15} stroke="#14b8a6" strokeOpacity={0.4} strokeWidth={1} />
        )}

        {/* Tick marks */}
        {Array.from({ length: 36 }).map((_, i) => {
          const deg = i * 10;
          const isCardinal = deg % 90 === 0;
          const inner = polar(cx, cy, r - (isCardinal ? 8 : 4), deg);
          const outer = polar(cx, cy, r, deg);
          return (
            <line
              key={i}
              x1={inner.x}
              y1={inner.y}
              x2={outer.x}
              y2={outer.y}
              stroke={isCardinal ? '#374151' : '#9ca3af'}
              strokeWidth={isCardinal ? 1.5 : 0.75}
            />
          );
        })}

        {/* Cardinal labels */}
        {CARDINALS.map(({ label: l, deg }) => {
          const p = polar(cx, cy, r - 18, deg);
          const isMain = deg % 90 === 0;
          return (
            <text
              key={l}
              x={p.x}
              y={p.y}
              textAnchor="middle"
              dominantBaseline="central"
              fontSize={isMain ? 11 : 8}
              fontWeight={isMain ? 700 : 500}
              fill={l === 'N' ? '#dc2626' : '#374151'}
            >
              {l}
            </text>
          );
        })}

        {/* Target bearing marker (if separate from current) */}
        {targetMarker && (
          <circle cx={targetMarker.x} cy={targetMarker.y} r={4} fill="#f59e0b" stroke="white" strokeWidth={1} />
        )}

        {/* Pointer line */}
        <line x1={cx} y1={cy} x2={pointer.x} y2={pointer.y} stroke="#0d9488" strokeWidth={2.5} strokeLinecap="round" />
        {/* Arrow head */}
        <circle cx={pointer.x} cy={pointer.y} r={5} fill="#14b8a6" stroke="white" strokeWidth={1.5} />

        {/* Center hub */}
        <circle cx={cx} cy={cy} r={3} fill="#374151" />
      </svg>

      <div className="mt-2 text-center">
        <div className="font-mono text-lg font-semibold text-ink-900 tabular-nums">{normalized}&deg;</div>
        <div className="text-xs text-ink-500">{cardinalName(normalized)}</div>
      </div>

      <input
        id={inputId}
        type="number"
        min={0}
        max={360}
        value={normalized}
        disabled={disabled}
        onChange={(e) => {
          const v = parseInt(e.target.value);
          if (!isNaN(v)) onChange(((v % 360) + 360) % 360);
        }}
        className="mt-2 w-20 px-2 py-1 border border-ink-200 rounded-sm text-center font-mono text-sm"
        aria-label={`${label || 'Bearing'} degrees`}
      />
    </div>
  );
}
