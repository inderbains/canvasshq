"use client";

import L from "leaflet";
import "leaflet-draw";
import { useEffect, useState } from "react";
import {
  CircleMarker,
  GeoJSON,
  MapContainer,
  TileLayer,
  useMap,
} from "react-leaflet";
import type { Feature, FeatureCollection, Polygon } from "geojson";
import type { AddressPoint } from "@/lib/types";

type Member = {
  user_id: string;
  email: string | null;
  display_name: string | null;
  role: string;
};

function DrawingControl({
  onCreated,
}: {
  onCreated: (feature: Feature<Polygon>) => void;
}) {
  const map = useMap();

  useEffect(() => {
    const drawn = new L.FeatureGroup();
    map.addLayer(drawn);

    const control = new L.Control.Draw({
      edit: {
        featureGroup: drawn,
        edit: false,
        remove: true,
      },
      draw: {
        polygon: {
          allowIntersection: false,
        },
        rectangle: false,
        polyline: false,
        circle: false,
        circlemarker: false,
        marker: false,
      },
    });

    map.addControl(control);

    const handleCreated = (event: L.LeafletEvent) => {
      const createdEvent = event as L.LeafletEvent & {
        layer: L.Polygon;
      };

      drawn.clearLayers();
      drawn.addLayer(createdEvent.layer);

      const geo =
        createdEvent.layer.toGeoJSON() as Feature<Polygon>;

      onCreated(geo);
    };

    map.on(L.Draw.Event.CREATED, handleCreated);

    return () => {
      map.off(L.Draw.Event.CREATED, handleCreated);
      map.removeControl(control);
      map.removeLayer(drawn);
    };
  }, [map, onCreated]);

  return null;
}

export default function TerritoryMap({
  organizationId,
  campaignId,
  addresses,
  members,
}: {
  organizationId: string;
  campaignId: string;
  addresses: AddressPoint[];
  members: Member[];
}) {
  const [boundary, setBoundary] =
    useState<FeatureCollection | null>(null);

  const [polygon, setPolygon] =
    useState<Feature<Polygon> | null>(null);

  const [name, setName] = useState("");
  const [assignedTo, setAssignedTo] = useState("");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch("/api/boundary?district=Surrey%20North")
      .then((r) => r.json())
      .then(setBoundary)
      .catch(() => setBoundary(null));
  }, []);

  async function createTerritory() {
    if (!polygon || !name.trim()) {
      setMessage(
        "Draw a polygon and enter a territory name first."
      );
      return;
    }

    setSaving(true);
    setMessage(
      "Creating territory and matching addresses…"
    );

    const response = await fetch("/api/territories", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        organizationId,
        campaignId,
        name,
        assignedTo: assignedTo || null,
        boundary: polygon,
      }),
    });

    const data = await response.json();

    setSaving(false);

    if (!response.ok) {
      setMessage(
        data.error || "Could not create territory."
      );
      return;
    }

    setMessage(
      `Territory created with ${data.addressCount.toLocaleString()} addresses.`
    );

    window.setTimeout(() => {
      window.location.reload();
    }, 1000);
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
            attribution="&copy; OpenStreetMap contributors"
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />

          {boundary ? (
            <GeoJSON
              data={boundary}
              style={{
                color: "#315efb",
                weight: 3,
                fillOpacity: 0.03,
              }}
            />
          ) : null}

          {addresses.map((address) => (
            <CircleMarker
              key={address.id}
              center={[
                address.latitude,
                address.longitude,
              ]}
              radius={2.5}
              pathOptions={{
                color: "#718096",
                fillOpacity: 0.45,
                weight: 0,
              }}
            />
          ))}

          <DrawingControl onCreated={setPolygon} />
        </MapContainer>
      </div>

      <aside className="card map-side">
        <h2>Create territory</h2>

        <p className="small muted">
          Use the polygon tool on the map to draw an
          area. Every imported address inside it will
          be attached to the territory.
        </p>

        <div
          className="form"
          style={{ marginTop: 16 }}
        >
          <div className="field">
            <label>Territory name</label>

            <input
              value={name}
              onChange={(e) =>
                setName(e.target.value)
              }
              placeholder="SN-01"
            />
          </div>

          <div className="field">
            <label>
              Assign to person (optional)
            </label>

            <select
              value={assignedTo}
              onChange={(e) =>
                setAssignedTo(e.target.value)
              }
            >
              <option value="">
                Unassigned
              </option>

              {members.map((member) => (
                <option
                  key={member.user_id}
                  value={member.user_id}
                >
                  {member.display_name ||
                    member.email ||
                    "User"}{" "}
                  —{" "}
                  {member.role.replace("_", " ")}
                </option>
              ))}
            </select>
          </div>

          {message ? (
            <div className="alert">
              {message}
            </div>
          ) : null}

          <button
            className="btn"
            disabled={saving || !polygon}
            onClick={createTerritory}
          >
            {saving
              ? "Creating…"
              : "Create & assign territory"}
          </button>
        </div>
      </aside>
    </div>
  );
}
