"use client";

import { useEffect, useMemo, useState } from "react";
import L from "leaflet";
import {
  CircleMarker,
  GeoJSON,
  MapContainer,
  Popup,
  TileLayer,
  Tooltip,
  useMap,
} from "react-leaflet";
import type { Feature, FeatureCollection, Polygon } from "geojson";
import type { AddressPoint, CanvassOutcome } from "@/lib/types";

const outcomeColor: Record<CanvassOutcome, string> = {
  not_visited: "#718096",
  no_answer: "#b7791f",
  contacted: "#315efb",
  refused: "#c0392b",
  follow_up: "#805ad5",
  completed: "#138a5b",
};

function FitBoundary({ boundary }: { boundary: FeatureCollection | null }) {
  const map = useMap();

  useEffect(() => {
    if (!boundary?.features?.length) return;
    const layer = L.geoJSON(boundary);
    map.fitBounds(layer.getBounds(), { padding: [24, 24] });
  }, [boundary, map]);

  return null;
}

function FitAssignedArea({ points }: { points: AddressPoint[] }) {
  const map = useMap();

  useEffect(() => {
    if (!points.length) return;

    const bounds = L.latLngBounds(
      points.map((point) => [point.latitude, point.longitude] as L.LatLngTuple)
    );

    if (points.length === 1) {
      map.setView([points[0].latitude, points[0].longitude], 18);
    } else {
      map.fitBounds(bounds, {
        padding: [36, 36],
        maxZoom: 17,
      });
    }

    // Keep a canvasser focused around the doors assigned to them.
    map.setMaxBounds(bounds.pad(0.35));
    map.options.maxBoundsViscosity = 1.0;
  }, [map, points]);

  return null;
}

export default function CanvassMap({
  addresses,
  campaignId,
  readOnly = false,
  focusAssigned = false,
  assignedTerritories = [],
}: {
  addresses: AddressPoint[];
  campaignId: string;
  readOnly?: boolean;
  focusAssigned?: boolean;
  assignedTerritories?: Feature<Polygon>[];
}) {
  const [boundary, setBoundary] = useState<FeatureCollection | null>(null);
  const [selected, setSelected] = useState<AddressPoint | null>(null);
  const [saving, setSaving] = useState(false);
  const [outcome, setOutcome] = useState<CanvassOutcome>("contacted");
  const [notes, setNotes] = useState("");

  const points = useMemo(
    () =>
      addresses.filter(
        (address) =>
          Number.isFinite(address.latitude) && Number.isFinite(address.longitude)
      ),
    [addresses]
  );

  useEffect(() => {
    if (focusAssigned) return;

    fetch("/api/boundary?district=Surrey%20North")
      .then((response) => (response.ok ? response.json() : Promise.reject()))
      .then(setBoundary)
      .catch(() => setBoundary(null));
  }, [focusAssigned]);

  async function saveVisit() {
    if (!selected) return;

    setSaving(true);

    const response = await fetch("/api/addresses", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        campaignId,
        addressId: selected.id,
        outcome,
        notes,
      }),
    });

    setSaving(false);

    if (response.ok) {
      setSelected(null);
      setNotes("");
      window.location.reload();
    }
  }

  return (
    <div className="map-layout">
      <div className="card map-card">
        <MapContainer
          className="map-canvas"
          center={[49.18, -122.85]}
          zoom={12}
          preferCanvas
        >
          <TileLayer
            attribution='&copy; OpenStreetMap contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />

          {!focusAssigned && boundary ? (
            <GeoJSON
              data={boundary}
              interactive={false}
              style={{
                color: "#315efb",
                weight: 3,
                fillOpacity: 0.04,
              }}
            />
          ) : null}

          {!focusAssigned && boundary ? <FitBoundary boundary={boundary} /> : null}
          {focusAssigned ? <FitAssignedArea points={points} /> : null}

          {assignedTerritories.map((territory, index) => (
            <GeoJSON
              key={`territory-${index}`}
              data={territory}
              interactive={false}
              style={{
                color: "#315efb",
                weight: 4,
                fillColor: "#315efb",
                fillOpacity: 0.07,
              }}
            />
          ))}

          {points.map((address) => {
            const current = address.latest_outcome ?? "not_visited";
            const color = outcomeColor[current];
            const chooseAddress = () => setSelected(address);

            return (
              <div key={address.id}>
                <CircleMarker
                  center={[address.latitude, address.longitude]}
                  radius={6}
                  interactive
                  bubblingMouseEvents={false}
                  pathOptions={{
                    color,
                    fillColor: color,
                    fillOpacity: 0.95,
                    weight: 2,
                  }}
                  eventHandlers={{
                    click: chooseAddress,
                  }}
                >
                  <Tooltip direction="top" offset={[0, -5]} opacity={0.95}>
                    {address.full_address}
                  </Tooltip>
                  <Popup>
                    <strong>{address.full_address}</strong>
                    <br />
                    Click the address point to record a visit.
                  </Popup>
                </CircleMarker>

                {/* Larger invisible hit area makes the door easier to tap on phones/tablets. */}
                <CircleMarker
                  center={[address.latitude, address.longitude]}
                  radius={13}
                  interactive
                  bubblingMouseEvents={false}
                  pathOptions={{
                    color: "transparent",
                    fillColor: "#000000",
                    fillOpacity: 0.01,
                    weight: 0,
                  }}
                  eventHandlers={{
                    click: chooseAddress,
                  }}
                />
              </div>
            );
          })}
        </MapContainer>
      </div>

      <aside className="card map-side">
        <h2>{focusAssigned ? "My assigned doors" : "Canvass map"}</h2>
        <p className="muted small">
          {points.length.toLocaleString()} addresses loaded
        </p>

        <div className="legend">
          <span>● Not visited</span>
          <span>● No answer</span>
          <span>● Contacted</span>
          <span>● Follow-up</span>
          <span>● Completed</span>
        </div>

        {!selected ? (
          <div className="alert">
            {points.length === 0
              ? "No doors are assigned to this account yet."
              : readOnly
                ? "Read-only map access."
                : focusAssigned
                  ? "Tap a dot inside your assigned territory to record the visit."
                  : "Tap any address point to record a visit."}
          </div>
        ) : readOnly ? (
          <div className="door-card">
            <strong>{selected.full_address}</strong>
            <div className="alert">Your Viewer role cannot add canvass records.</div>
          </div>
        ) : (
          <div className="door-card">
            <strong>{selected.full_address}</strong>
            <div className="small muted">Record this visit</div>

            <div className="form" style={{ marginTop: 14 }}>
              <div className="field">
                <label>Outcome</label>
                <select
                  value={outcome}
                  onChange={(event) =>
                    setOutcome(event.target.value as CanvassOutcome)
                  }
                >
                  <option value="contacted">Contacted</option>
                  <option value="no_answer">No answer</option>
                  <option value="refused">Refused</option>
                  <option value="follow_up">Follow-up requested</option>
                  <option value="completed">Completed</option>
                </select>
              </div>

              <div className="field">
                <label>Notes</label>
                <textarea
                  rows={4}
                  value={notes}
                  onChange={(event) => setNotes(event.target.value)}
                  placeholder="Optional operational notes"
                />
              </div>

              <button className="btn" disabled={saving} onClick={saveVisit}>
                {saving ? "Saving…" : "Save visit"}
              </button>

              <button
                className="btn secondary"
                type="button"
                onClick={() => setSelected(null)}
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </aside>
    </div>
  );
}
