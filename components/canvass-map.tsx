"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
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
import type { Feature, FeatureCollection, MultiPolygon, Polygon } from "geojson";
import type { AddressPoint, CanvassOutcome } from "@/lib/types";

const outcomeColor: Record<CanvassOutcome, string> = {
  not_visited: "#718096",
  no_answer: "#b7791f",
  contacted: "#315efb",
  refused: "#c0392b",
  follow_up: "#805ad5",
  completed: "#138a5b",
};

type CoverageProperties = {
  OBJECTID?: number;
  FACILITY_TYPE?: string | null;
  LOCATION?: string | null;
  NAME?: string | null;
  CIVIC_FACILITY?: string | null;
  candidate_id: string;
  centroid_latitude: number;
  centroid_longitude: number;
  nearest_address: string | null;
  nearest_distance_m: number | null;
};

type CoverageCandidate = Feature<Polygon | MultiPolygon, CoverageProperties>;

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
      points.map((point) => [point.latitude, point.longitude] as L.LatLngTuple),
    );

    if (points.length === 1) {
      map.setView([points[0].latitude, points[0].longitude], 18);
    } else {
      map.fitBounds(bounds, {
        padding: [36, 36],
        maxZoom: 17,
      });
    }

    map.setMaxBounds(bounds.pad(0.35));
    map.options.maxBoundsViscosity = 1.0;
  }, [map, points]);

  return null;
}

function ZoomWatcher({ onZoom }: { onZoom: (zoom: number) => void }) {
  const map = useMap();

  useEffect(() => {
    const update = () => onZoom(map.getZoom());
    update();
    map.on("zoomend", update);
    return () => {
      map.off("zoomend", update);
    };
  }, [map, onZoom]);

  return null;
}

function CoverageReviewController({
  enabled,
  campaignId,
  onCandidates,
  onLoading,
  onMessage,
}: {
  enabled: boolean;
  campaignId: string;
  onCandidates: (candidates: CoverageCandidate[]) => void;
  onLoading: (loading: boolean) => void;
  onMessage: (message: string) => void;
}) {
  const map = useMap();

  useEffect(() => {
    if (!enabled) {
      onCandidates([]);
      onMessage("");
      return;
    }

    let controller: AbortController | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const load = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(async () => {
        if (map.getZoom() < 16) {
          onCandidates([]);
          onMessage("Zoom in to street level to review missing buildings.");
          return;
        }

        const bounds = map.getBounds();
        const bbox = [
          bounds.getWest(),
          bounds.getSouth(),
          bounds.getEast(),
          bounds.getNorth(),
        ].join(",");

        controller?.abort();
        controller = new AbortController();
        onLoading(true);
        onMessage("Checking visible buildings against campaign address points…");

        try {
          const response = await fetch(
            `/api/coverage/buildings?campaignId=${encodeURIComponent(
              campaignId,
            )}&bbox=${encodeURIComponent(bbox)}`,
            { signal: controller.signal },
          );
          const data = await response.json();

          if (!response.ok) {
            onCandidates([]);
            onMessage(data.error || "Could not review this map area.");
            return;
          }

          const candidates = (data.candidates ?? []) as CoverageCandidate[];
          onCandidates(candidates);
          onMessage(
            candidates.length
              ? `${candidates.length.toLocaleString()} building candidates need address review in this view.`
              : "No obvious missing building candidates in this view.",
          );
        } catch (error) {
          if (error instanceof DOMException && error.name === "AbortError") return;
          onCandidates([]);
          onMessage("Could not load building coverage review.");
        } finally {
          onLoading(false);
        }
      }, 250);
    };

    load();
    map.on("moveend", load);
    map.on("zoomend", load);

    return () => {
      if (timer) clearTimeout(timer);
      controller?.abort();
      map.off("moveend", load);
      map.off("zoomend", load);
    };
  }, [campaignId, enabled, map, onCandidates, onLoading, onMessage]);

  return null;
}

export default function CanvassMap({
  addresses,
  campaignId,
  organizationId,
  districtId,
  readOnly = false,
  focusAssigned = false,
  assignedTerritories = [],
  canManageCoverage = false,
}: {
  addresses: AddressPoint[];
  campaignId: string;
  organizationId: string;
  districtId: string;
  readOnly?: boolean;
  focusAssigned?: boolean;
  assignedTerritories?: Feature<Polygon>[];
  canManageCoverage?: boolean;
}) {
  const [boundary, setBoundary] = useState<FeatureCollection | null>(null);
  const [selected, setSelected] = useState<AddressPoint | null>(null);
  const [saving, setSaving] = useState(false);
  const [outcome, setOutcome] = useState<CanvassOutcome>("contacted");
  const [notes, setNotes] = useState("");
  const [zoom, setZoom] = useState(12);

  const [coverageEnabled, setCoverageEnabled] = useState(focusAssigned);
  const [coverageCandidates, setCoverageCandidates] = useState<CoverageCandidate[]>([]);
  const [coverageLoading, setCoverageLoading] = useState(false);
  const [coverageMessage, setCoverageMessage] = useState("");
  const [selectedCandidate, setSelectedCandidate] = useState<CoverageCandidate | null>(null);
  const [manualAddress, setManualAddress] = useState("");
  const [manualSaving, setManualSaving] = useState(false);
  const [manualMessage, setManualMessage] = useState("");

  const points = useMemo(
    () =>
      addresses.filter(
        (address) =>
          Number.isFinite(address.latitude) && Number.isFinite(address.longitude),
      ),
    [addresses],
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

  function chooseCoverageCandidate(candidate: CoverageCandidate) {
    setSelected(null);
    setSelectedCandidate(candidate);
    setManualMessage("");
    setManualAddress(candidate.properties.LOCATION?.trim() || "");
  }

  async function addManualDoor() {
    if (!selectedCandidate || !manualAddress.trim()) return;

    setManualSaving(true);
    setManualMessage("Adding verified door…");

    const response = await fetch("/api/coverage/manual-door", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        organizationId,
        campaignId,
        districtId,
        fullAddress: manualAddress.trim(),
        latitude: selectedCandidate.properties.centroid_latitude,
        longitude: selectedCandidate.properties.centroid_longitude,
      }),
    });

    const data = await response.json();
    setManualSaving(false);

    if (!response.ok) {
      setManualMessage(data.error || "Could not add this door.");
      return;
    }

    setManualMessage(
      data.assignedTo
        ? "Door added and automatically assigned with its territory."
        : "Door added to the campaign.",
    );

    window.setTimeout(() => window.location.reload(), 700);
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

          <ZoomWatcher onZoom={setZoom} />

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

          {canManageCoverage ? (
            <CoverageReviewController
              enabled={coverageEnabled}
              campaignId={campaignId}
              onCandidates={setCoverageCandidates}
              onLoading={setCoverageLoading}
              onMessage={setCoverageMessage}
            />
          ) : null}

          {coverageEnabled
            ? coverageCandidates.map((candidate) => (
                <Fragment key={`coverage-${candidate.properties.candidate_id}`}>
                  <GeoJSON
                    data={candidate}
                    style={{
                      color: "#dd7a00",
                      weight: 2,
                      fillColor: "#f59e0b",
                      fillOpacity: 0.08,
                      dashArray: "5 5",
                    }}
                    eventHandlers={{
                      click: () => chooseCoverageCandidate(candidate),
                    }}
                  />
                  <CircleMarker
                    center={[
                      candidate.properties.centroid_latitude,
                      candidate.properties.centroid_longitude,
                    ]}
                    radius={7}
                    bubblingMouseEvents={false}
                    pathOptions={{
                      color: "#9a4b00",
                      fillColor: "#f59e0b",
                      fillOpacity: 0.92,
                      weight: 2,
                    }}
                    eventHandlers={{
                      click: () => chooseCoverageCandidate(candidate),
                    }}
                  >
                    <Tooltip direction="top" opacity={0.96}>
                      Missing address candidate — click to verify
                    </Tooltip>
                  </CircleMarker>
                </Fragment>
              ))
            : null}

          {points.map((address) => {
            const current = address.latest_outcome ?? "not_visited";
            const color = outcomeColor[current];
            const chooseAddress = () => {
              setSelectedCandidate(null);
              setSelected(address);
            };

            return (
              <Fragment key={address.id}>
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
                  eventHandlers={{ click: chooseAddress }}
                >
                  <Tooltip
                    direction="top"
                    offset={[0, -5]}
                    opacity={0.95}
                    permanent={zoom >= 18}
                  >
                    {zoom >= 18 && address.house_number
                      ? address.house_number
                      : address.full_address}
                  </Tooltip>
                  <Popup>
                    <strong>{address.full_address}</strong>
                    <br />
                    Click the address point to record a visit.
                  </Popup>
                </CircleMarker>

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
                  eventHandlers={{ click: chooseAddress }}
                />
              </Fragment>
            );
          })}
        </MapContainer>
      </div>

      <aside className="card map-side">
        <h2>{focusAssigned ? "My assigned doors" : "Canvass map"}</h2>
        <p className="muted small">{points.length.toLocaleString()} verified doors loaded</p>

        <div className="legend">
          <span>● Not visited</span>
          <span>● No answer</span>
          <span>● Contacted</span>
          <span>● Follow-up</span>
          <span>● Completed</span>
        </div>

        {canManageCoverage ? (
          <div style={{ marginTop: 14 }}>
            {!focusAssigned ? (
              <button
                type="button"
                className={coverageEnabled ? "btn secondary" : "btn"}
                onClick={() => {
                  setCoverageEnabled((value) => !value);
                  setSelectedCandidate(null);
                  setManualMessage("");
                }}
              >
                {coverageEnabled ? "Hide coverage review" : "Review missing buildings"}
              </button>
            ) : null}
            {coverageEnabled ? (
              <div className="alert" style={{ marginTop: 10 }}>
                {coverageLoading ? "Checking buildings…" : coverageMessage}
                <div className="small muted" style={{ marginTop: 6 }}>
                  {focusAssigned
                    ? "Orange dots are possible missing doors inside your assigned territory. Tap one, confirm the civic address, and it becomes a normal canvass door."
                    : "Orange dots are candidates only. Verify the civic address before adding a door."}
                </div>
              </div>
            ) : null}
          </div>
        ) : null}

        {selectedCandidate ? (
          <div className="door-card">
            <strong>Missing building candidate</strong>
            <div className="small muted" style={{ marginTop: 6 }}>
              This building did not match a nearby campaign address point. Confirm the street number before adding it.
            </div>
            {selectedCandidate.properties.nearest_address ? (
              <div className="small muted" style={{ marginTop: 8 }}>
                Nearest existing door: {selectedCandidate.properties.nearest_address}
                {selectedCandidate.properties.nearest_distance_m != null
                  ? ` (${selectedCandidate.properties.nearest_distance_m} m away)`
                  : ""}
              </div>
            ) : null}

            <div className="form" style={{ marginTop: 14 }}>
              <div className="field">
                <label>Verified civic address</label>
                <input
                  value={manualAddress}
                  onChange={(event) => setManualAddress(event.target.value)}
                  placeholder="12246 81 Avenue"
                />
              </div>

              {manualMessage ? <div className="alert">{manualMessage}</div> : null}

              <button
                className="btn"
                type="button"
                disabled={manualSaving || !manualAddress.trim()}
                onClick={addManualDoor}
              >
                {manualSaving ? "Adding…" : "Add verified door"}
              </button>

              <button
                className="btn secondary"
                type="button"
                onClick={() => {
                  setSelectedCandidate(null);
                  setManualAddress("");
                  setManualMessage("");
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        ) : !selected ? (
          <div className="alert">
            {points.length === 0
              ? "No doors are assigned to this account yet."
              : readOnly
                ? "Read-only map access."
                : focusAssigned
                  ? "Tap a dot inside your assigned territory to record the visit."
                  : "Tap any verified address point to record a visit."}
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
