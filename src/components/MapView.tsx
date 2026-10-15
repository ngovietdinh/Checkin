import { useEffect } from "react";
import { Circle, CircleMarker, MapContainer, Popup, TileLayer, Tooltip, useMap, useMapEvents } from "react-leaflet";
import type { Branch } from "@/lib/types";
import type { ReactNode } from "react";

export interface MapPoint { id: string; lat: number; lng: number; color?: string; label: string; popup?: ReactNode }

function FitBounds({ points }: { points: [number, number][] }) {
  const map = useMap();
  useEffect(() => {
    if (points.length === 1) map.setView(points[0], 16);
    else if (points.length > 1) map.fitBounds(points, { padding: [30, 30], maxZoom: 17 });
  }, [map, JSON.stringify(points)]); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}

function ClickHandler({ onClick }: { onClick: (lat: number, lng: number) => void }) {
  useMapEvents({ click: (e) => onClick(e.latlng.lat, e.latlng.lng) });
  return null;
}

/** Bản đồ OpenStreetMap: vùng chấm công của chi nhánh + vị trí chấm công */
export default function MapView({ branches = [], points = [], height = 360, onPick, fit = true }: {
  branches?: Pick<Branch, "id" | "name" | "lat" | "lng" | "radius_m">[]; points?: MapPoint[]; height?: number;
  onPick?: (lat: number, lng: number) => void; fit?: boolean;
}) {
  const all: [number, number][] = [...branches.map((b) => [b.lat, b.lng] as [number, number]), ...points.map((p) => [p.lat, p.lng] as [number, number])];
  const center: [number, number] = all[0] ?? [16.05, 108.2];
  return (
    <MapContainer center={center} zoom={all.length ? 15 : 5} style={{ height }} scrollWheelZoom>
      <TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
      {fit && <FitBounds points={all} />}
      {onPick && <ClickHandler onClick={onPick} />}
      {branches.map((b) => (
        <Circle key={b.id} center={[b.lat, b.lng]} radius={b.radius_m} pathOptions={{ color: "#0f766e", fillOpacity: 0.12 }}>
          <Tooltip>{b.name} – bán kính {b.radius_m}m</Tooltip>
        </Circle>
      ))}
      {points.map((p) => (
        <CircleMarker key={p.id} center={[p.lat, p.lng]} radius={7} pathOptions={{ color: "#fff", weight: 2, fillColor: p.color ?? "#2563eb", fillOpacity: 1 }}>
          <Tooltip>{p.label}</Tooltip>
          {p.popup && <Popup>{p.popup}</Popup>}
        </CircleMarker>
      ))}
    </MapContainer>
  );
}
