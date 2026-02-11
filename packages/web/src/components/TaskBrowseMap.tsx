'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  MapContainer as LeafletMapContainer,
  TileLayer as LeafletTileLayer,
  Marker as LeafletMarker,
  Popup as LeafletPopup,
  Circle as LeafletCircle,
  CircleMarker as LeafletCircleMarker,
  useMap,
  useMapEvents,
} from 'react-leaflet';
import L from 'leaflet';
import MapPopup from './MapPopup';

// Cast to any to fix React 19 / react-leaflet type incompatibility
const MapContainer = LeafletMapContainer as any;
const TileLayer = LeafletTileLayer as any;
const Marker = LeafletMarker as any;
const Popup = LeafletPopup as any;
const Circle = LeafletCircle as any;
const CircleMarker = LeafletCircleMarker as any;

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

// Blue marker for user location
const userIcon = L.icon({
  iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-blue.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});

L.Marker.prototype.options.icon = defaultIcon;

type TaskData = {
  id: string;
  title: string;
  template: string;
  bounty: { amount: number; currency: string };
  location: { lat: number; lon: number; radius_m: number };
  time_window: { start_iso: string; end_iso: string };
  is_claimed?: boolean;
};

type TaskBrowseMapProps = {
  tasks: TaskData[];
  height?: string;
  userLocation?: [number, number] | null;
  radiusFilter?: number | null;
  onTaskSelect?: (task: TaskData) => void;
  onTaskClaim?: (taskId: string) => void;
  selectedTaskId?: string | null;
  claimingTaskId?: string | null;
  showUserLocation?: boolean;
  showRadiusCircle?: boolean;
  enableClustering?: boolean;
  className?: string;
};

// Calculate distance between two points using Haversine formula
function calculateDistanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
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

// Component to fit bounds to tasks
function FitBounds({
  tasks,
  userLocation,
}: {
  tasks: TaskData[];
  userLocation?: [number, number] | null;
}) {
  const map = useMap();
  const hasInitialized = useRef(false);

  useEffect(() => {
    if (hasInitialized.current) return;

    const points: [number, number][] = tasks.map((t) => [t.location.lat, t.location.lon]);
    if (userLocation) {
      points.push(userLocation);
    }

    if (points.length === 0) {
      map.setView([20, 0], 3);
    } else if (points.length === 1) {
      map.setView(points[0], 13);
    } else {
      map.fitBounds(points, { padding: [50, 50], maxZoom: 14 });
    }

    hasInitialized.current = true;
  }, [map, tasks, userLocation]);

  return null;
}

// Simple marker clustering by grouping nearby tasks
function useClusteredTasks(tasks: TaskData[], zoomLevel: number) {
  return useMemo(() => {
    if (zoomLevel >= 12 || tasks.length < 10) {
      // Don't cluster at high zoom or with few tasks
      return { clusters: [], singles: tasks };
    }

    // Simple grid-based clustering
    const gridSize = Math.pow(2, 8 - Math.min(zoomLevel, 8)); // Larger grid at lower zoom
    const grid: Map<string, TaskData[]> = new Map();

    tasks.forEach((task) => {
      const gridX = Math.floor(task.location.lon / gridSize);
      const gridY = Math.floor(task.location.lat / gridSize);
      const key = `${gridX},${gridY}`;

      if (!grid.has(key)) {
        grid.set(key, []);
      }
      grid.get(key)!.push(task);
    });

    const clusters: Array<{ center: [number, number]; tasks: TaskData[]; totalBounty: number }> = [];
    const singles: TaskData[] = [];

    grid.forEach((groupedTasks) => {
      if (groupedTasks.length === 1) {
        singles.push(groupedTasks[0]);
      } else {
        // Calculate cluster center and total bounty
        const avgLat = groupedTasks.reduce((s, t) => s + t.location.lat, 0) / groupedTasks.length;
        const avgLon = groupedTasks.reduce((s, t) => s + t.location.lon, 0) / groupedTasks.length;
        const totalBounty = groupedTasks.reduce((s, t) => s + t.bounty.amount, 0);

        clusters.push({
          center: [avgLat, avgLon],
          tasks: groupedTasks,
          totalBounty,
        });
      }
    });

    return { clusters, singles };
  }, [tasks, zoomLevel]);
}

// Track zoom level changes
function ZoomTracker({ onZoomChange }: { onZoomChange: (zoom: number) => void }) {
  const map = useMapEvents({
    zoomend: () => {
      onZoomChange(map.getZoom());
    },
  });

  useEffect(() => {
    onZoomChange(map.getZoom());
  }, [map, onZoomChange]);

  return null;
}

export default function TaskBrowseMap({
  tasks,
  height = '450px',
  userLocation,
  radiusFilter,
  onTaskSelect,
  onTaskClaim,
  selectedTaskId,
  claimingTaskId,
  showUserLocation = true,
  showRadiusCircle = true,
  enableClustering = true,
  className = '',
}: TaskBrowseMapProps) {
  const [zoomLevel, setZoomLevel] = useState(10);

  const { clusters, singles } = useClusteredTasks(
    enableClustering ? tasks : [],
    enableClustering ? zoomLevel : 20
  );

  // When clustering is disabled, show all tasks as singles
  const displayTasks = enableClustering ? singles : tasks;

  const handleViewDetails = useCallback(
    (taskId: string) => {
      const task = tasks.find((t) => t.id === taskId);
      if (task && onTaskSelect) {
        onTaskSelect(task);
      }
    },
    [tasks, onTaskSelect]
  );

  const mapCenter = useMemo<[number, number]>(() => {
    if (userLocation) return userLocation;
    if (tasks.length > 0) return [tasks[0].location.lat, tasks[0].location.lon];
    return [20, 0];
  }, [userLocation, tasks]);

  const radiusCircleOptions = useMemo(
    () => ({
      color: '#3b82f6',
      weight: 2,
      fillColor: '#60a5fa',
      fillOpacity: 0.1,
      dashArray: '5, 5',
    }),
    []
  );

  const getMarkerStyle = useCallback(
    (task: TaskData) => {
      const isSelected = task.id === selectedTaskId;
      return {
        color: isSelected ? '#0f172a' : '#14b8a6',
        weight: isSelected ? 3 : 2,
        fillColor: isSelected ? '#0f172a' : '#5eead4',
        fillOpacity: isSelected ? 0.9 : 0.7,
      };
    },
    [selectedTaskId]
  );

  return (
    <div
      className={`w-full rounded-sm overflow-hidden border border-ink-200 ${className}`}
      style={{ height }}
    >
      <MapContainer center={mapCenter} zoom={10} scrollWheelZoom className="h-full w-full">
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        <FitBounds tasks={tasks} userLocation={userLocation} />
        <ZoomTracker onZoomChange={setZoomLevel} />

        {/* User location marker */}
        {showUserLocation && userLocation && (
          <Marker position={userLocation} icon={userIcon}>
            <Popup>
              <div className="text-sm">
                <div className="font-medium text-ink-900">Your Location</div>
                <div className="font-mono tabular-nums text-ink-500">
                  {userLocation[0].toFixed(4)}, {userLocation[1].toFixed(4)}
                </div>
              </div>
            </Popup>
          </Marker>
        )}

        {/* Radius filter circle around user */}
        {showRadiusCircle && userLocation && radiusFilter && (
          <Circle
            center={userLocation}
            radius={radiusFilter * 1000} // Convert km to meters
            pathOptions={radiusCircleOptions}
          />
        )}

        {/* Clustered markers */}
        {enableClustering &&
          clusters.map((cluster, index) => (
            <CircleMarker
              key={`cluster-${index}`}
              center={cluster.center}
              radius={Math.min(20, 8 + cluster.tasks.length * 2)}
              pathOptions={{
                color: '#14b8a6',
                weight: 2,
                fillColor: '#14b8a6',
                fillOpacity: 0.8,
              }}
            >
              <Popup>
                <div className="min-w-[200px]">
                  <div className="font-semibold text-ink-900 mb-2">
                    {cluster.tasks.length} Tasks in this area
                  </div>
                  <div className="text-sm font-mono tabular-nums text-ink-700 mb-2">
                    Total bounties: USDC {cluster.totalBounty.toFixed(2)}
                  </div>
                  <div className="max-h-[150px] overflow-y-auto space-y-1">
                    {cluster.tasks.slice(0, 5).map((task) => (
                      <button
                        key={task.id}
                        onClick={() => handleViewDetails(task.id)}
                        className="w-full text-left text-xs p-1.5 hover:bg-ink-50 rounded-sm border border-ink-100"
                      >
                        <div className="font-medium truncate">{task.title}</div>
                        <div className="font-mono tabular-nums text-signal-green">
                          {task.bounty.currency} {task.bounty.amount.toFixed(2)}
                        </div>
                      </button>
                    ))}
                    {cluster.tasks.length > 5 && (
                      <div className="text-xs text-ink-500 text-center py-1">
                        +{cluster.tasks.length - 5} more
                      </div>
                    )}
                  </div>
                </div>
              </Popup>
            </CircleMarker>
          ))}

        {/* Individual task markers */}
        {displayTasks.map((task) => {
          const distanceKm = userLocation
            ? calculateDistanceKm(userLocation[0], userLocation[1], task.location.lat, task.location.lon)
            : null;

          return (
            <CircleMarker
              key={task.id}
              center={[task.location.lat, task.location.lon]}
              radius={8}
              pathOptions={getMarkerStyle(task)}
              eventHandlers={{
                click: () => onTaskSelect?.(task),
              }}
            >
              <Popup>
                <MapPopup
                  task={{
                    ...task,
                    distanceKm,
                  }}
                  onClaim={onTaskClaim}
                  onViewDetails={handleViewDetails}
                  claiming={claimingTaskId === task.id}
                />
              </Popup>
            </CircleMarker>
          );
        })}
      </MapContainer>
    </div>
  );
}
