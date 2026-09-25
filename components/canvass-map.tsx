"use client";

import { useEffect, useMemo, useState } from "react";
import L from "leaflet";
import { CircleMarker, GeoJSON, MapContainer, Popup, TileLayer, useMap } from "react-leaflet";
import type { FeatureCollection } from "geojson";
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

export default function CanvassMap({ addresses, campaignId, readOnly = false }: { addresses: AddressPoint[]; campaignId: string; readOnly?: boolean }) {
  const [boundary, setBoundary] = useState<FeatureCollection | null>(null);
  const [selected, setSelected] = useState<AddressPoint | null>(null);
  const [saving, setSaving] = useState(false);
  const [outcome, setOutcome] = useState<CanvassOutcome>("contacted");
  const [notes, setNotes] = useState("");
  const points = useMemo(() => addresses.filter(a => Number.isFinite(a.latitude) && Number.isFinite(a.longitude)), [addresses]);

  useEffect(() => {
    fetch("/api/boundary?district=Surrey%20North")
      .then(r => r.ok ? r.json() : Promise.reject())
      .then(setBoundary)
      .catch(() => setBoundary(null));
  }, []);

  async function saveVisit() {
    if (!selected) return;
    setSaving(true);
    const response = await fetch("/api/addresses", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ campaignId, addressId: selected.id, outcome, notes }),
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
        <MapContainer className="map-canvas" center={[49.18, -122.85]} zoom={12} preferCanvas>
          <TileLayer attribution='&copy; OpenStreetMap contributors' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
          {boundary ? <GeoJSON data={boundary} style={{ color: "#315efb", weight: 3, fillOpacity: 0.04 }} /> : null}
          {boundary ? <FitBoundary boundary={boundary} /> : null}
          {points.map((address) => {
            const current = address.latest_outcome ?? "not_visited";
            return (
              <CircleMarker
                key={address.id}
                center={[address.latitude, address.longitude]}
                radius={5}
                pathOptions={{ color: outcomeColor[current], fillColor: outcomeColor[current], fillOpacity: 0.82, weight: 1 }}
                eventHandlers={{ click: () => setSelected(address) }}
              >
                <Popup>{address.full_address}</Popup>
              </CircleMarker>
            );
          })}
        </MapContainer>
      </div>
      <aside className="card map-side">
        <h2>Canvass map</h2>
        <p className="muted small">{points.length.toLocaleString()} addresses loaded</p>
        <div className="legend">
          <span>● Not visited</span><span>● No answer</span><span>● Contacted</span><span>● Follow-up</span><span>● Completed</span>
        </div>
        {!selected ? (
          <div className="alert">{readOnly ? "Read-only map access." : "Tap any address point to record a visit. Zoom in to work door by door."}</div>
        ) : readOnly ? (
          <div className="door-card"><strong>{selected.full_address}</strong><div className="alert">Your Viewer role cannot add canvass records.</div></div>
        ) : (
          <div className="door-card">
            <strong>{selected.full_address}</strong>
            <div className="small muted">Record this visit</div>
            <div className="form" style={{ marginTop: 14 }}>
              <div className="field">
                <label>Outcome</label>
                <select value={outcome} onChange={e => setOutcome(e.target.value as CanvassOutcome)}>
                  <option value="contacted">Contacted</option>
                  <option value="no_answer">No answer</option>
                  <option value="refused">Refused</option>
                  <option value="follow_up">Follow-up requested</option>
                  <option value="completed">Completed</option>
                </select>
              </div>
              <div className="field"><label>Notes</label><textarea rows={4} value={notes} onChange={e => setNotes(e.target.value)} placeholder="Optional operational notes" /></div>
              <button className="btn" disabled={saving} onClick={saveVisit}>{saving ? "Saving…" : "Save visit"}</button>
              <button className="btn secondary" onClick={() => setSelected(null)}>Cancel</button>
            </div>
          </div>
        )}
      </aside>
    </div>
  );
}
