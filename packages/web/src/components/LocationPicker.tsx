'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  MapContainer as LeafletMapContainer,
  TileLayer as LeafletTileLayer,
  Marker as LeafletMarker,
  Circle as LeafletCircle,
  useMapEvents,
  useMap,
} from 'react-leaflet';
import L from 'leaflet';

// Cast to any to fix React 19 / react-leaflet type incompatibility
const MapContainer = LeafletMapContainer as any;
const TileLayer = LeafletTileLayer as any;
const Marker = LeafletMarker as any;
const Circle = LeafletCircle as any;

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

// Teal marker for task location
const tealIcon = L.icon({
  iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-green.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});

L.Marker.prototype.options.icon = defaultIcon;

type LocationPickerProps = {
  value: { lat: number; lon: number };
  radius?: number;
  onChange: (location: { lat: number; lon: number }) => void;
  onRadiusChange?: (radius: number) => void;
  height?: string;
  zoom?: number;
  className?: string;
  showSearch?: boolean;
  showRadiusControl?: boolean;
  draggableMarker?: boolean;
};

// Component to handle map click events
function MapClickHandler({
  onClick,
}: {
  onClick: (lat: number, lon: number) => void;
}) {
  useMapEvents({
    click: (e) => {
      onClick(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}

// Component to recenter map when location changes externally
function MapRecenter({ lat, lon }: { lat: number; lon: number }) {
  const map = useMap();

  useEffect(() => {
    map.setView([lat, lon], map.getZoom(), { animate: true });
  }, [map, lat, lon]);

  return null;
}

// Geocoding search component
function GeocodingSearch({
  onSelect,
}: {
  onSelect: (lat: number, lon: number, displayName: string) => void;
}) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const searchTimeout = useRef<NodeJS.Timeout | null>(null);

  const handleSearch = useCallback(async (searchQuery: string) => {
    if (searchQuery.length < 3) {
      setResults([]);
      return;
    }

    setIsLoading(true);
    try {
      const response = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(searchQuery)}&limit=5`,
        {
          headers: {
            'User-Agent': 'FieldNetwork/1.0',
          },
        }
      );
      const data = await response.json();
      setResults(data);
      setShowResults(true);
    } catch (error) {
      console.error('Geocoding search failed:', error);
      setResults([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const handleInputChange = (value: string) => {
    setQuery(value);

    if (searchTimeout.current) {
      clearTimeout(searchTimeout.current);
    }

    searchTimeout.current = setTimeout(() => {
      handleSearch(value);
    }, 300);
  };

  const handleSelectResult = (result: any) => {
    const lat = parseFloat(result.lat);
    const lon = parseFloat(result.lon);
    onSelect(lat, lon, result.display_name);
    setQuery(result.display_name.split(',')[0]);
    setShowResults(false);
    setResults([]);
  };

  return (
    <div className="relative">
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <input
            type="text"
            value={query}
            onChange={(e) => handleInputChange(e.target.value)}
            onFocus={() => results.length > 0 && setShowResults(true)}
            placeholder="Search for a location..."
            className="w-full px-3 py-2 pl-9 text-sm border border-surface-300 rounded-md shadow-sm focus:ring-field-500 focus:border-field-500"
          />
          <svg
            className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
            />
          </svg>
          {isLoading && (
            <div className="absolute right-3 top-1/2 -translate-y-1/2">
              <div className="animate-spin h-4 w-4 border-2 border-field-500 border-t-transparent rounded-full" />
            </div>
          )}
        </div>
      </div>

      {/* Search results dropdown */}
      {showResults && results.length > 0 && (
        <div className="absolute z-50 mt-1 w-full bg-white border border-surface-200 rounded-md shadow-lg max-h-60 overflow-auto">
          {results.map((result, index) => (
            <button
              key={index}
              type="button"
              onClick={() => handleSelectResult(result)}
              className="w-full px-3 py-2 text-left text-sm hover:bg-slate-50 border-b border-surface-100 last:border-b-0"
            >
              <div className="font-medium text-slate-800 truncate">
                {result.display_name.split(',')[0]}
              </div>
              <div className="text-xs text-slate-500 truncate">
                {result.display_name}
              </div>
            </button>
          ))}
        </div>
      )}

      {/* Close results when clicking outside */}
      {showResults && (
        <div
          className="fixed inset-0 z-40"
          onClick={() => setShowResults(false)}
        />
      )}
    </div>
  );
}

export default function LocationPicker({
  value,
  radius = 50,
  onChange,
  onRadiusChange,
  height = '350px',
  zoom = 15,
  className = '',
  showSearch = true,
  showRadiusControl = true,
  draggableMarker = true,
}: LocationPickerProps) {
  const [localRadius, setLocalRadius] = useState(radius);
  const markerRef = useRef<L.Marker>(null);

  // Sync local radius with prop
  useEffect(() => {
    setLocalRadius(radius);
  }, [radius]);

  const handleMapClick = useCallback(
    (lat: number, lon: number) => {
      onChange({ lat, lon });
    },
    [onChange]
  );

  const handleMarkerDrag = useCallback(() => {
    const marker = markerRef.current;
    if (marker) {
      const position = marker.getLatLng();
      onChange({ lat: position.lat, lon: position.lng });
    }
  }, [onChange]);

  const handleRadiusChange = useCallback(
    (newRadius: number) => {
      setLocalRadius(newRadius);
      onRadiusChange?.(newRadius);
    },
    [onRadiusChange]
  );

  const handleGeocodingSelect = useCallback(
    (lat: number, lon: number) => {
      onChange({ lat, lon });
    },
    [onChange]
  );

  const eventHandlers = useMemo(
    () => ({
      dragend: handleMarkerDrag,
    }),
    [handleMarkerDrag]
  );

  const circleOptions = useMemo(
    () => ({
      color: '#14b8a6',
      weight: 2,
      fillColor: '#5eead4',
      fillOpacity: 0.2,
    }),
    []
  );

  return (
    <div className={`space-y-3 ${className}`}>
      {/* Search box */}
      {showSearch && (
        <GeocodingSearch onSelect={handleGeocodingSelect} />
      )}

      {/* Map */}
      <div
        className="w-full rounded-lg overflow-hidden border border-surface-200"
        style={{ height }}
      >
        <MapContainer
          center={[value.lat, value.lon]}
          zoom={zoom}
          scrollWheelZoom
          className="h-full w-full"
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <MapClickHandler onClick={handleMapClick} />
          <MapRecenter lat={value.lat} lon={value.lon} />

          {/* Task location marker */}
          <Marker
            ref={markerRef}
            position={[value.lat, value.lon]}
            icon={tealIcon}
            draggable={draggableMarker}
            eventHandlers={eventHandlers}
          />

          {/* Radius circle */}
          {showRadiusControl && (
            <Circle
              center={[value.lat, value.lon]}
              radius={localRadius}
              pathOptions={circleOptions}
            />
          )}
        </MapContainer>
      </div>

      {/* Controls below map */}
      <div className="flex flex-wrap items-end gap-4">
        {/* Coordinates display */}
        <div className="flex gap-3">
          <div>
            <label className="block text-xs text-slate-500 mb-1">Latitude</label>
            <input
              type="number"
              step="0.0001"
              value={value.lat.toFixed(6)}
              onChange={(e) =>
                onChange({ lat: parseFloat(e.target.value) || 0, lon: value.lon })
              }
              className="w-32 px-2 py-1.5 text-sm border border-surface-300 rounded-md"
            />
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">Longitude</label>
            <input
              type="number"
              step="0.0001"
              value={value.lon.toFixed(6)}
              onChange={(e) =>
                onChange({ lat: value.lat, lon: parseFloat(e.target.value) || 0 })
              }
              className="w-32 px-2 py-1.5 text-sm border border-surface-300 rounded-md"
            />
          </div>
        </div>

        {/* Radius control */}
        {showRadiusControl && onRadiusChange && (
          <div className="flex-1 min-w-[200px]">
            <label className="block text-xs text-slate-500 mb-1">
              Radius: {localRadius}m
            </label>
            <input
              type="range"
              min="10"
              max="500"
              step="10"
              value={localRadius}
              onChange={(e) => handleRadiusChange(parseInt(e.target.value))}
              className="w-full"
            />
          </div>
        )}

        {/* Get current location button */}
        <button
          type="button"
          onClick={() => {
            if (navigator.geolocation) {
              navigator.geolocation.getCurrentPosition(
                (position) => {
                  onChange({
                    lat: position.coords.latitude,
                    lon: position.coords.longitude,
                  });
                },
                (error) => {
                  console.error('Geolocation error:', error);
                }
              );
            }
          }}
          className="px-3 py-1.5 text-sm border border-surface-300 rounded-md text-slate-600 hover:bg-slate-50 flex items-center gap-1.5"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"
            />
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"
            />
          </svg>
          Use my location
        </button>
      </div>

      {/* Help text */}
      <p className="text-xs text-slate-500">
        Click on the map to place the marker, or drag the marker to adjust. Use the search box to find a location by address.
      </p>
    </div>
  );
}
