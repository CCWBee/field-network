'use client';

import { MapContainer, TileLayer, CircleMarker, Marker, Tooltip, useMap, Popup } from 'react-leaflet';
import L from 'leaflet';
import { useEffect, useMemo } from 'react';

// Fix default marker icon issue in Next.js
const defaultIcon = L.icon({
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});

L.Marker.prototype.options.icon = defaultIcon;

export type MapPoint = {
  id: string;
  lat: number;
  lon: number;
  label?: string;
  value?: number | string;
  color?: string;
  radius?: number;
  popup?: React.ReactNode;
};

export type MapProps = {
  points?: MapPoint[];
  center?: [number, number];
  zoom?: number;
  height?: string;
  onPointClick?: (point: MapPoint) => void;
  selectedId?: string | null;
  showMarkers?: boolean;
  showCircles?: boolean;
  fitBoundsOnLoad?: boolean;
  className?: string;
  tileLayer?: 'osm' | 'carto-light' | 'carto-dark';
};

const DEFAULT_CENTER: [number, number] = [20, 0];
const DEFAULT_ZOOM = 3;

const TILE_LAYERS = {
  osm: {
    url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  },
  'carto-light': {
    url: 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
  },
  'carto-dark': {
    url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
  },
};

function FitBounds({ points, center, fitOnLoad }: { points: MapPoint[]; center: [number, number]; fitOnLoad: boolean }) {
  const map = useMap();

  useEffect(() => {
    if (!fitOnLoad) return;

    if (points.length === 0) {
      map.setView(center, DEFAULT_ZOOM);
      return;
    }

    if (points.length === 1) {
      map.setView([points[0].lat, points[0].lon], 11);
      return;
    }

    const bounds = points.map((point) => [point.lat, point.lon]) as [number, number][];
    map.fitBounds(bounds, { padding: [40, 40] });
  }, [map, points, center, fitOnLoad]);

  return null;
}

export default function Map({
  points = [],
  center,
  zoom = DEFAULT_ZOOM,
  height = '420px',
  onPointClick,
  selectedId,
  showMarkers = false,
  showCircles = true,
  fitBoundsOnLoad = true,
  className = '',
  tileLayer = 'osm',
}: MapProps) {
  const mapCenter = center ?? DEFAULT_CENTER;
  const tile = TILE_LAYERS[tileLayer];

  const circleOptions = useMemo(() => ({
    default: {
      color: '#14b8a6',
      weight: 2,
      fillColor: '#5eead4',
      fillOpacity: 0.7,
    },
    selected: {
      color: '#0f172a',
      weight: 3,
      fillColor: '#0f172a',
      fillOpacity: 0.9,
    },
  }), []);

  return (
    <div className={`w-full rounded-lg overflow-hidden border border-surface-200 ${className}`} style={{ height }}>
      <MapContainer center={mapCenter} zoom={zoom} scrollWheelZoom className="h-full w-full">
        <TileLayer attribution={tile.attribution} url={tile.url} />
        <FitBounds points={points} center={mapCenter} fitOnLoad={fitBoundsOnLoad} />

        {showCircles && points.map((point) => (
          <CircleMarker
            key={point.id}
            center={[point.lat, point.lon]}
            radius={point.radius ?? 6}
            pathOptions={
              point.color
                ? { ...circleOptions.default, color: point.color, fillColor: point.color }
                : point.id === selectedId
                ? circleOptions.selected
                : circleOptions.default
            }
            eventHandlers={{
              click: () => onPointClick?.(point),
            }}
          >
            {point.label && (
              <Tooltip direction="top" offset={[0, -4]} opacity={0.9}>
                {point.label}
              </Tooltip>
            )}
            {point.popup && <Popup>{point.popup}</Popup>}
          </CircleMarker>
        ))}

        {showMarkers && points.map((point) => (
          <Marker
            key={point.id}
            position={[point.lat, point.lon]}
            eventHandlers={{
              click: () => onPointClick?.(point),
            }}
          >
            {point.label && (
              <Tooltip direction="top" offset={[0, -20]} opacity={0.9}>
                {point.label}
              </Tooltip>
            )}
            {point.popup && <Popup>{point.popup}</Popup>}
          </Marker>
        ))}
      </MapContainer>
    </div>
  );
}

// Utility function to calculate distance between two points in km (Haversine formula)
export function calculateDistanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371; // Earth's radius in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}
