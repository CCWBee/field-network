'use client';

import { useEffect, useRef } from 'react';
import { MapContainer as LeafletMapContainer, TileLayer as LeafletTileLayer, CircleMarker as LeafletCircleMarker, Tooltip as LeafletTooltip, Popup as LeafletPopup, useMap } from 'react-leaflet';
import MapPopup from './MapPopup';

// Cast to any to fix React 19 / react-leaflet type incompatibility
const MapContainer = LeafletMapContainer as any;
const TileLayer = LeafletTileLayer as any;
const CircleMarker = LeafletCircleMarker as any;
const Tooltip = LeafletTooltip as any;
const Popup = LeafletPopup as any;

type TaskPoint = {
  id: string;
  title?: string;
  template?: string;
  location: { lat: number; lon: number; radius_m: number };
  bounty: { amount: number; currency: string };
  time_window?: { start_iso: string; end_iso: string };
  is_claimed?: boolean;
};

const DEFAULT_CENTER: [number, number] = [20, 0];

function FitBounds({ tasks, center }: { tasks: TaskPoint[]; center: [number, number] }) {
  const map = useMap();
  const hasInitialized = useRef(false);

  useEffect(() => {
    if (hasInitialized.current) return;

    if (tasks.length === 0) {
      map.setView(center, 3);
    } else if (tasks.length === 1) {
      map.setView([tasks[0].location.lat, tasks[0].location.lon], 11);
    } else {
      const bounds = tasks.map((task) => [task.location.lat, task.location.lon]) as [number, number][];
      map.fitBounds(bounds, { padding: [40, 40] });
    }

    hasInitialized.current = true;
  }, [map, tasks, center]);

  return null;
}

export default function TaskMap({
  tasks,
  center,
  onSelect,
  onClaim,
  selectedId,
  claimingId,
  height = '420px',
  showPopups = true,
}: {
  tasks: TaskPoint[];
  center?: [number, number];
  onSelect?: (task: TaskPoint) => void;
  onClaim?: (taskId: string) => void;
  selectedId?: string | null;
  claimingId?: string | null;
  height?: string;
  showPopups?: boolean;
}) {
  const mapCenter = center ?? DEFAULT_CENTER;

  return (
    <div className="w-full rounded-sm overflow-hidden border border-ink-200" style={{ height }}>
      <MapContainer center={mapCenter} zoom={3} scrollWheelZoom className="h-full w-full">
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <FitBounds tasks={tasks} center={mapCenter} />
        {tasks.map((task) => (
          <CircleMarker
            key={task.id}
            center={[task.location.lat, task.location.lon]}
            radius={8}
            pathOptions={{
              color: task.id === selectedId ? '#0f172a' : '#14b8a6',
              weight: task.id === selectedId ? 3 : 2,
              fillColor: task.id === selectedId ? '#0f172a' : '#5eead4',
              fillOpacity: task.id === selectedId ? 0.9 : 0.7,
            }}
            eventHandlers={{
              click: () => onSelect?.(task),
            }}
          >
            <Tooltip direction="top" offset={[0, -4]} opacity={0.9}>
              {task.bounty.currency} {task.bounty.amount.toFixed(2)}
            </Tooltip>
            {showPopups && task.title && task.template && task.time_window && (
              <Popup>
                <MapPopup
                  task={{
                    id: task.id,
                    title: task.title,
                    template: task.template,
                    bounty: task.bounty,
                    location: task.location,
                    time_window: task.time_window,
                    is_claimed: task.is_claimed,
                  }}
                  onClaim={onClaim}
                  onViewDetails={(id) => onSelect?.(tasks.find(t => t.id === id)!)}
                  claiming={claimingId === task.id}
                />
              </Popup>
            )}
          </CircleMarker>
        ))}
      </MapContainer>
    </div>
  );
}
