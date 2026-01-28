'use client';

import React, { useEffect, useRef } from 'react';

export default function HeightMapBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;

    // Set canvas size
    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      ctx.scale(dpr, dpr);
    };
    resize();
    window.addEventListener('resize', resize);

    // Terrain parameters for contour generation
    const resolution = 8;
    let cols = Math.ceil(canvas.width / dpr / resolution) + 2;
    let rows = Math.ceil(canvas.height / dpr / resolution) + 2;

    // Generate realistic terrain height field
    const generateHeight = (x: number, y: number, t: number) => {
      let height = 0;
      // Large mountain features
      height += Math.sin(x * 0.025 + t * 0.12) * Math.cos(y * 0.025) * 60;
      height += Math.sin((x + 15) * 0.035) * Math.cos((y - 10) * 0.035 + t * 0.1) * 45;
      // Medium hills
      height += Math.sin(x * 0.06 + y * 0.06 + t * 0.15) * 25;
      height += Math.cos(x * 0.09 - y * 0.08 + t * 0.12) * 18;
      // Small features
      height += Math.sin(x * 0.15 + y * 0.15 + t * 0.2) * 10;
      height += Math.cos(x * 0.22 + y * 0.18 + t * 0.18) * 6;
      return height;
    };

    // Initialize height map
    let heightMap: number[][] = [];
    for (let y = 0; y < rows; y++) {
      heightMap[y] = [];
      for (let x = 0; x < cols; x++) {
        heightMap[y][x] = generateHeight(x, y, 0);
      }
    }

    let time = 0;

    const draw = () => {
      const w = canvas.width / dpr;
      const h = canvas.height / dpr;

      // Recalculate cols/rows on each frame in case of resize
      cols = Math.ceil(w / resolution) + 2;
      rows = Math.ceil(h / resolution) + 2;

      // Ensure heightMap is properly sized
      while (heightMap.length < rows) {
        heightMap.push([]);
      }
      for (let y = 0; y < rows; y++) {
        while (heightMap[y].length < cols) {
          heightMap[y].push(0);
        }
      }

      // Clear with dark background
      ctx.fillStyle = '#050607';
      ctx.fillRect(0, 0, w, h);

      time += 0.008;

      // Update height map
      for (let y = 0; y < rows; y++) {
        for (let x = 0; x < cols; x++) {
          heightMap[y][x] = generateHeight(x, y, time);
        }
      }

      // LAYER 1: Draw flowing contour lines
      const contourInterval = 8;
      const numContours = 20;

      for (let i = 0; i < numContours; i++) {
        const level = -80 + (i * contourInterval);
        const shimmer = Math.sin(time * 1.8 + i * 0.2) * 0.08 + 0.92;
        const isMainContour = i % 5 === 0;
        ctx.lineWidth = isMainContour ? 0.8 : 0.4;

        const baseAlpha = 0.15 + (i / numContours) * 0.15;
        ctx.strokeStyle = `rgba(20, 184, 166, ${baseAlpha * shimmer})`;

        const segments: { x: number; y: number; edge: string }[][] = [];

        for (let y = 0; y < rows - 1; y++) {
          for (let x = 0; x < cols - 1; x++) {
            const h1 = heightMap[y][x];
            const h2 = heightMap[y][x + 1];
            const h3 = heightMap[y + 1][x];
            const h4 = heightMap[y + 1][x + 1];

            const points: { x: number; y: number; edge: string }[] = [];

            if ((h1 <= level && h2 >= level) || (h1 >= level && h2 <= level)) {
              const t = (level - h1) / (h2 - h1);
              points.push({ x: (x + t) * resolution, y: y * resolution, edge: 'top' });
            }

            if ((h2 <= level && h4 >= level) || (h2 >= level && h4 <= level)) {
              const t = (level - h2) / (h4 - h2);
              points.push({ x: (x + 1) * resolution, y: (y + t) * resolution, edge: 'right' });
            }

            if ((h3 <= level && h4 >= level) || (h3 >= level && h4 <= level)) {
              const t = (level - h3) / (h4 - h3);
              points.push({ x: (x + t) * resolution, y: (y + 1) * resolution, edge: 'bottom' });
            }

            if ((h1 <= level && h3 >= level) || (h1 >= level && h3 <= level)) {
              const t = (level - h1) / (h3 - h1);
              points.push({ x: x * resolution, y: (y + t) * resolution, edge: 'left' });
            }

            if (points.length >= 2) {
              segments.push(points);
            }
          }
        }

        ctx.beginPath();
        for (const seg of segments) {
          if (seg.length >= 2) {
            ctx.moveTo(seg[0].x, seg[0].y);
            for (let j = 1; j < seg.length; j++) {
              ctx.lineTo(seg[j].x, seg[j].y);
            }
          }
        }
        ctx.stroke();
      }

      // LAYER 2: Draw tessellation pattern
      const tessSize = 50;
      const tessPhase = Math.sin(time * 1.2) * 0.2 + 0.8;

      for (let y = 0; y < h; y += tessSize) {
        for (let x = 0; x < w; x += tessSize) {
          const localPhase = Math.sin(time * 2.5 + x * 0.008 + y * 0.008) * 0.25 + 0.75;
          const localShimmer = Math.sin(time * 2.8 + x * 0.012 - y * 0.01) * 0.2 + 0.8;
          const finalAlpha = 0.1 * tessPhase * localPhase * localShimmer;

          ctx.strokeStyle = `rgba(20, 184, 166, ${finalAlpha})`;
          ctx.lineWidth = 0.6;

          const x1 = x;
          const y1 = y;
          const x2 = x + tessSize;
          const y2 = y + tessSize;
          const xm = x + tessSize / 2;
          const ym = y + tessSize / 2;

          ctx.beginPath();
          ctx.moveTo(xm, y1);
          ctx.lineTo(x2, ym);
          ctx.lineTo(xm, y2);
          ctx.lineTo(x1, ym);
          ctx.closePath();
          ctx.stroke();

          const crossAlpha = finalAlpha * (Math.sin(time * 3 + x * 0.01 + y * 0.01) * 0.3 + 0.7);
          ctx.strokeStyle = `rgba(20, 184, 166, ${crossAlpha})`;
          ctx.beginPath();
          ctx.moveTo(xm, y1);
          ctx.lineTo(xm, y2);
          ctx.moveTo(x1, ym);
          ctx.lineTo(x2, ym);
          ctx.stroke();
        }
      }

      // LAYER 3: Draw grid lines with scintillation
      const gridSize = 100;
      const baseScintillation = Math.sin(time * 0.6) * 0.2 + 0.8;

      ctx.lineWidth = 1;
      ctx.setLineDash([5, 5]);

      for (let x = 0; x < w; x += gridSize) {
        const wave = Math.sin(time * 0.7 + x * 0.003) * 0.25 + 0.75;
        const pulse = Math.sin(time * 0.4 + x * 0.002) * 0.15 + 0.85;
        const finalAlpha = 0.4 * baseScintillation * wave * pulse;

        ctx.strokeStyle = `rgba(20, 184, 166, ${finalAlpha})`;
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, h);
        ctx.stroke();
      }

      for (let y = 0; y < h; y += gridSize) {
        const wave = Math.sin(time * 0.7 + y * 0.003) * 0.25 + 0.75;
        const pulse = Math.sin(time * 0.4 + y * 0.002) * 0.15 + 0.85;
        const finalAlpha = 0.4 * baseScintillation * wave * pulse;

        ctx.strokeStyle = `rgba(20, 184, 166, ${finalAlpha})`;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
        ctx.stroke();
      }

      ctx.setLineDash([]);

      animationRef.current = requestAnimationFrame(draw);
    };

    draw();

    return () => {
      window.removeEventListener('resize', resize);
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 w-full h-full"
    />
  );
}
