'use client';

import { useMemo } from 'react';
import {
  MapContainer as LeafletMapContainer,
  TileLayer as LeafletTileLayer,
  Marker as LeafletMarker,
  Circle as LeafletCircle,
  CircleMarker as LeafletCircleMarker,
  Popup as LeafletPopup,
  Polyline as LeafletPolyline,
  useMap,
} from 'react-leaflet';
import L from 'leaflet';

// Cast to any to fix React 19 / react-leaflet type incompatibility
const MapContainer = LeafletMapContainer as any;
const TileLayer = LeafletTileLayer as any;
const Marker = LeafletMarker as any;
const Circle = LeafletCircle as any;
const CircleMarker = LeafletCircleMarker as any;
const Popup = LeafletPopup as any;
const Polyline = LeafletPolyline as any;
import { useEffect } from 'react';
import { SubmissionMapPopup } from './MapPopup';

// Fix default marker icon
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

type TaskLocation = {
  lat: number;
  lon: number;
  radius_m: number;
};

type Submission = {
  id: string;
  status: string;
  location?: { lat: number; lon: number } | null;
  artefacts?: any[];
  createdAt?: string;
};

type TaskDetailMapProps = {
  taskLocation: TaskLocation;
  submissions?: Submission[];
  height?: string;
  className?: string;
  showRadius?: boolean;
  showSubmissionLines?: boolean;
};

// Calculate distance between two points in meters
function calculateDistanceM(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000; // Earth's radius in meters
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

// Component to fit bounds
function FitBounds({
  taskLocation,
  submissions,
}: {
  taskLocation: TaskLocation;
  submissions: Submission[];
}) {
  const map = useMap();

  useEffect(() => {
    const points: [number, number][] = [[taskLocation.lat, taskLocation.lon]];

    submissions.forEach((sub) => {
      if (sub.location?.lat && sub.location?.lon) {
        points.push([sub.location.lat, sub.location.lon]);
      }
    });

    if (points.length === 1) {
      // Just the task location - zoom to show the radius
      const radiusInDegrees = taskLocation.radius_m / 111000; // Rough conversion
      map.fitBounds(
        [
          [taskLocation.lat - radiusInDegrees * 2, taskLocation.lon - radiusInDegrees * 2],
          [taskLocation.lat + radiusInDegrees * 2, taskLocation.lon + radiusInDegrees * 2],
        ],
        { padding: [30, 30] }
      );
    } else {
      map.fitBounds(points, { padding: [40, 40] });
    }
  }, [map, taskLocation, submissions]);

  return null;
}

export default function TaskDetailMap({
  taskLocation,
  submissions = [],
  height = '300px',
  className = '',
  showRadius = true,
  showSubmissionLines = true,
}: TaskDetailMapProps) {
  const radiusCircleOptions = useMemo(
    () => ({
      color: '#14b8a6',
      weight: 2,
      fillColor: '#5eead4',
      fillOpacity: 0.15,
    }),
    []
  );

  const submissionsWithDistance = useMemo(() => {
    return submissions.map((sub) => {
      if (!sub.location?.lat || !sub.location?.lon) {
        return { ...sub, distanceFromTask: undefined, withinRadius: undefined };
      }

      const distance = calculateDistanceM(
        taskLocation.lat,
        taskLocation.lon,
        sub.location.lat,
        sub.location.lon
      );

      return {
        ...sub,
        distanceFromTask: distance,
        withinRadius: distance <= taskLocation.radius_m,
      };
    });
  }, [submissions, taskLocation]);

  const getSubmissionColor = (sub: typeof submissionsWithDistance[0]) => {
    if (sub.status === 'accepted') return '#22c55e'; // green
    if (sub.status === 'rejected') return '#ef4444'; // red
    if (sub.withinRadius === false) return '#f59e0b'; // amber (warning)
    return '#6366f1'; // indigo (default for pending)
  };

  return (
    <div
      className={`w-full rounded-lg overflow-hidden border border-surface-200 ${className}`}
      style={{ height }}
    >
      <MapContainer
        center={[taskLocation.lat, taskLocation.lon]}
        zoom={16}
        scrollWheelZoom
        className="h-full w-full"
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        <FitBounds taskLocation={taskLocation} submissions={submissions} />

        {/* Task location marker */}
        <Marker position={[taskLocation.lat, taskLocation.lon]} icon={tealIcon}>
          <Popup>
            <div className="min-w-[150px]">
              <div className="font-medium text-slate-800">Task Location</div>
              <div className="text-sm text-slate-500 mt-1">
                {taskLocation.lat.toFixed(6)}, {taskLocation.lon.toFixed(6)}
              </div>
              <div className="text-sm text-slate-500">
                Required radius: {taskLocation.radius_m}m
              </div>
            </div>
          </Popup>
        </Marker>

        {/* Task radius circle */}
        {showRadius && (
          <Circle
            center={[taskLocation.lat, taskLocation.lon]}
            radius={taskLocation.radius_m}
            pathOptions={radiusCircleOptions}
          />
        )}

        {/* Submission markers and lines */}
        {submissionsWithDistance.map((sub) => {
          if (!sub.location?.lat || !sub.location?.lon) return null;

          const color = getSubmissionColor(sub);

          return (
            <div key={sub.id}>
              {/* Line from task to submission */}
              {showSubmissionLines && (
                <Polyline
                  positions={[
                    [taskLocation.lat, taskLocation.lon],
                    [sub.location.lat, sub.location.lon],
                  ]}
                  pathOptions={{
                    color: sub.withinRadius ? '#14b8a6' : '#f59e0b',
                    weight: 2,
                    dashArray: sub.withinRadius ? undefined : '5, 5',
                    opacity: 0.7,
                  }}
                />
              )}

              {/* Submission marker */}
              <CircleMarker
                center={[sub.location.lat, sub.location.lon]}
                radius={8}
                pathOptions={{
                  color,
                  weight: 2,
                  fillColor: color,
                  fillOpacity: 0.8,
                }}
              >
                <Popup>
                  <SubmissionMapPopup
                    submission={{
                      id: sub.id,
                      status: sub.status,
                      location: sub.location,
                      distanceFromTask: sub.distanceFromTask,
                      withinRadius: sub.withinRadius,
                      artefactCount: sub.artefacts?.length,
                      createdAt: sub.createdAt,
                    }}
                    taskLocation={taskLocation}
                  />
                </Popup>
              </CircleMarker>
            </div>
          );
        })}
      </MapContainer>
    </div>
  );
}
