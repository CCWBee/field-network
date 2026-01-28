'use client';

import { MapContainer, TileLayer, CircleMarker, Tooltip, useMap } from 'react-leaflet';

type TaskPoint = {
  id: string;
  location: { lat: number; lon: number; radius_m: number };
  bounty: { amount: number; currency: string };
};

const DEFAULT_CENTER: [number, number] = [20, 0];

function FitBounds({ tasks, center }: { tasks: TaskPoint[]; center: [number, number] }) {
  const map = useMap();

  if (tasks.length === 0) {
    map.setView(center, 3);
    return null;
  }

  if (tasks.length === 1) {
    map.setView([tasks[0].location.lat, tasks[0].location.lon], 11);
    return null;
  }

  const bounds = tasks.map((task) => [task.location.lat, task.location.lon]) as [number, number][];
  map.fitBounds(bounds, { padding: [40, 40] });
  return null;
}

export default function TaskMap({
  tasks,
  center,
  onSelect,
  selectedId,
}: {
  tasks: TaskPoint[];
  center?: [number, number];
  onSelect?: (task: TaskPoint) => void;
  selectedId?: string | null;
}) {
  const mapCenter = center ?? DEFAULT_CENTER;

  return (
    <div className="h-[420px] w-full rounded-lg overflow-hidden border border-surface-200">
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
            radius={6}
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
          </CircleMarker>
        ))}
      </MapContainer>
    </div>
  );
}
