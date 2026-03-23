'use client';

import React, { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import {
  Bus,
  MapPin,
  Navigation,
  Heart,
  X,
  Clock,
  ChevronRight,
  Info,
  Navigation2
} from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';

// Hyper-Engine Config - Restored Voyager Style
const MAP_STYLE = {
  version: 8,
  sources: {
    'voyager-tiles': {
      type: 'raster',
      tiles: ['https://basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png'],
      tileSize: 256,
      attribution: '&copy; OpenStreetMap'
    }
  },
  layers: [
    { id: 'voyager-layer', type: 'raster', source: 'voyager-tiles', minzoom: 0, maxzoom: 20 }
  ]
};
const CYPRUS_BOUNDS = [[32.2, 34.5], [34.7, 35.7]];

const createBusMarkerHtml = (shortName, bearing = 0, color = '#ff0033') => `
    <div class="balloon-bus-marker">
        <div class="balloon-label" style="background-color: #${color};">
            ${shortName || '?'}
        </div>
        <div class="rotated-bus-wrapper" style="transform: rotate(${bearing}deg)">
            <svg viewBox="0 0 50 100" xmlns="http://www.w3.org/2000/svg" style="width: 16px; height: 32px;">
                <rect x="5" y="5" width="40" height="90" rx="10" fill="#${color}" stroke="white" stroke-width="4" />
                <path d="M10 15 Q25 10 40 15 L40 30 Q25 35 10 30 Z" fill="rgba(0,0,0,0.8)" />
                <rect x="15" y="45" width="20" height="25" rx="3" fill="rgba(255,255,255,0.2)" />
                <circle cx="15" cy="10" r="3" fill="#fffb00" />
                <circle cx="35" cy="10" r="3" fill="#fffb00" />
            </svg>
        </div>
    </div>
`;

const TimetablePopup = ({ stop, arrivals, onSelectRoute, favorites, onToggleFavorite, t, routes }) => {
    const isFavorite = favorites?.some(f => f.stop_id === stop.stop_id);

    const getMinsRemaining = (arrivalTime) => {
        if (!arrivalTime) return null;
        const now = new Date();
        const [h, m, s] = arrivalTime.split(':').map(Number);
        const arrival = new Date();
        arrival.setHours(h || 0, m || 0, s || 0);
        if (arrival < now) arrival.setDate(arrival.getDate() + 1);
        const diff = Math.floor((arrival - now) / 60000);
        return diff >= 0 ? diff : 0;
    };

    return (
        <div className="stop-popup-v4">
            <div className="popup-top">
                <div className="stop-title-area">
                    <h3>{stop.name}</h3>
                    <span className="stop-code">{stop.stop_id}</span>
                </div>
                <button className="fav-pill-btn" onClick={() => onToggleFavorite(stop)}>
                    <Heart size={16} fill={isFavorite ? "#ff3366" : "transparent"} color={isFavorite ? "#ff3366" : "#fff"} />
                </button>
            </div>

            <div className="arrivals-scroll">
                {!arrivals ? (
                    <div className="popup-loading">{t.loading}...</div>
                ) : arrivals.length === 0 ? (
                    <div className="popup-empty">{t.no_buses}</div>
                ) : (
                    <div className="bus-list">
                        {arrivals.slice(0, 10).map((arr, idx) => {
                            const route = routes?.find(r => String(r.route_id) === String(arr.route_id));
                            const mins = getMinsRemaining(arr.arrival_time);
                            return (
                                <div key={`${arr.route_id}-${idx}`} className="bus-row" onClick={() => route && onSelectRoute(route)}>
                                    <div className="bus-badge" style={{ background: `#${route?.color || 'ff3366'}` }}>
                                        {arr.route_short_name}
                                    </div>
                                    <div className="bus-dest">{arr.trip_headsign}</div>
                                    <div className="bus-eta">
                                        <span className="abs-time">{arr.arrival_time?.slice(0, 5)}</span>
                                        <span className="rel-time">{mins} min</span>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
};

export default function Map({
  stops = [],
  shapes = [],
  routes = [],
  vehicles = [],
  selectedPlan,
  onSelectRoute,
  routeColor,
  onVehicleClick,
  showToast,
  showStops,
  setShowStops,
  isSatellite,
  setIsSatellite,
  favorites,
  toggleFavorite
}) {
  const mapContainer = useRef(null);
  const map = useRef(null);
  const { t } = useLanguage();

  const [arrivals, setArrivals] = useState(null);
  const [selectedStop, setSelectedStop] = useState(null);
  const [isFirstLoad, setIsFirstLoad] = useState(true);

  // Markers refs for cleanup
  const busMarkers = useRef({});
  const stopMarkers = useRef([]);
  const planMarkers = useRef([]);
  const userMarker = useRef(null);
  const activePopup = useRef(null);
  const [mapZoom, setMapZoom] = useState(13);

  // Initialization & Style Management
  useEffect(() => {
    if (map.current) {
      // Correctly update style based on mode
      if (isSatellite) {
        map.current.setStyle({
          version: 8,
          sources: { 'satellite': { type: 'raster', tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'], tileSize: 256 } },
          layers: [{ id: 'satellite-layer', type: 'raster', source: 'satellite' }]
        });
      } else {
        map.current.setStyle(MAP_STYLE);
      }
      return;
    }

    map.current = new maplibregl.Map({
      container: mapContainer.current,
      style: isSatellite ? {
        version: 8,
        sources: { 'satellite': { type: 'raster', tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'], tileSize: 256 } },
        layers: [{ id: 'satellite-layer', type: 'raster', source: 'satellite' }]
      } : MAP_STYLE,
      center: [33.3613, 35.1856], // Nicosia
      zoom: 13,
      pitch: 0,
      maxBounds: [[32.0, 34.4], [34.7, 35.7]]
    });

    map.current.addControl(new maplibregl.NavigationControl({ showPitch: false }), 'top-right');

    // Add layers on every style change (including first load)
    const addLayers = () => {
      // Route Source & Layers
      if (!map.current.getSource('route-source')) {
        map.current.addSource('route-source', {
          type: 'geojson',
          data: { type: 'FeatureCollection', features: [] }
        });

        map.current.addLayer({
          id: 'route-line',
          type: 'line',
          source: 'route-source',
          layout: { 'line-join': 'round', 'line-cap': 'round' },
          paint: {
            'line-color': routeColor?.startsWith('#') ? routeColor : (routeColor ? `#${routeColor}` : '#ff0033'),
            'line-width': 5
          }
        });
      }

      // Stops Layer (High-Perf Vector)
      if (!map.current.getSource('stops-source')) {
        map.current.addSource('stops-source', {
          type: 'geojson',
          data: { type: 'FeatureCollection', features: [] }
        });

        // Symbol Layer for stops (Pin Design matching 'Main' branch 'капли')
        map.current.addLayer({
          id: 'stops-layer',
          type: 'circle',
          source: 'stops-source',
          minzoom: 13, // Show earlier
          paint: {
            'circle-radius': ['interpolate', ['linear'], ['zoom'], 13, 3, 18, 10],
            'circle-color': '#ffffff',
            'circle-stroke-width': ['interpolate', ['linear'], ['zoom'], 13, 2, 18, 4],
            'circle-stroke-color': '#ff0033'
          }
        });

        // Click handler
        map.current.on('click', 'stops-layer', async (e) => {
          const stop = e.features[0].properties;
          if (activePopup.current) activePopup.current.remove();

          const popupNode = document.createElement('div');
          popupNode.id = `popup-${stop.stop_id}`;

          activePopup.current = new maplibregl.Popup({ maxWidth: '350px', className: 'stop-popup-v4' })
            .setLngLat([e.lngLat.lng, e.lngLat.lat])
            .setDOMContent(popupNode)
            .addTo(map.current);

          setSelectedStop(null);
          setArrivals(null);
          setSelectedStop(stop);
          try {
            const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'https://cyfinal.onrender.com'}/api/stops/${stop.stop_id}/timetable`);
            const data = await res.json();
            setArrivals(data);
          } catch (err) { setArrivals([]); }
        });

        map.current.on('mouseenter', 'stops-layer', () => map.current.getCanvas().style.cursor = 'pointer');
        map.current.on('mouseleave', 'stops-layer', () => map.current.getCanvas().style.cursor = '');
      }
    };

    map.current.on('style.load', addLayers);
    map.current.on('load', addLayers);
    map.current.on('zoom', () => setMapZoom(map.current.getZoom()));

    return () => {
      if (map.current) {
        map.current.remove();
        map.current = null;
      }
    };
  }, [isSatellite]);

  // Handle Shapes (Routes)
  useEffect(() => {
    if (!map.current || !map.current.isStyleLoaded()) return;

    if (shapes.length === 0) {
      const source = map.current.getSource('route-source');
      if (source) source.setData({ type: 'FeatureCollection', features: [] });
      return;
    }

    const geojson = {
      type: 'FeatureCollection',
      features: shapes.map(coords => ({
        type: 'Feature',
        geometry: {
          type: 'LineString',
          coordinates: coords.map(c => [c[1], c[0]]) // MapLibre uses [lng, lat]
        }
      }))
    };

    const source = map.current.getSource('route-source');
    if (source) source.setData(geojson);

    // Zoom to route on first load only
    if (shapes.length > 0 && isFirstLoad) {
      const allCoords = shapes.flat();
      const bounds = allCoords.reduce((b, c) => {
        return [
          [Math.min(b[0][0], c[1]), Math.min(b[0][1], c[0])],
          [Math.max(b[1][0], c[1]), Math.max(b[1][1], c[0])]
        ];
      }, [[allCoords[0][1], allCoords[0][0]], [allCoords[0][1], allCoords[0][0]]]);

      map.current.fitBounds(bounds, { padding: 50, duration: 1000 });
      setIsFirstLoad(false);
    }
  }, [shapes, routeColor]);

  // Handle Vehicles (Buses) with Balloon Markers from Main
  useEffect(() => {
    if (!map.current) return;

    // Remove obsolete markers
    const currentIds = new Set(vehicles.map(v => v._id || v.vehicle_id || v.id));
    Object.keys(busMarkers.current).forEach(id => {
      if (!currentIds.has(id)) {
        busMarkers.current[id].remove();
        delete busMarkers.current[id];
      }
    });

    // Update/Add markers
    vehicles.forEach(v => {
      const lat = parseFloat(v.lat || v.lt);
      const lng = parseFloat(v.lon || v.ln);
      const bearing = parseFloat(v.bearing || v.b || 0);
      const markerId = v._id || v.vehicle_id || v.id;
      const color = v.color || v.c || 'ff0033';
      const shortName = v.route_short_name || v.sn || '?';

      // SAFETY GUARD: skip invalid coordinates
      if (isNaN(lat) || isNaN(lng)) return;

      if (busMarkers.current[markerId]) {
        busMarkers.current[markerId].setLngLat([lng, lat]);
        const el = busMarkers.current[markerId].getElement();
        const wrapper = el.querySelector('.rotated-bus-wrapper');
        if (wrapper && !isNaN(bearing)) {
          wrapper.style.transform = `rotate(${bearing}deg)`;
        }
        const label = el.querySelector('.balloon-label');
        if (label) label.style.backgroundColor = `#${color}`;
      } else {
        const el = document.createElement('div');
        el.className = 'custom-bus-marker-container';
        el.innerHTML = createBusMarkerHtml(shortName, bearing, color);

        el.onclick = (e) => {
          e.stopPropagation();
          if (activePopup.current) activePopup.current.remove();

          const popupEl = document.createElement('div');
          popupEl.className = 'bus-popup-v2';
          popupEl.style.cssText = 'text-align: center; color: #fff; padding: 10px; min-width: 180px;';
          popupEl.innerHTML = `
                <div style="background: #${color}; padding: 10px 18px; border-radius: 25px; display: inline-block; font-size: 1.3rem; font-weight: 900; margin-bottom: 12px; box-shadow: 0 3px 8px rgba(0,0,0,0.3); border: 2px solid rgba(255,255,255,0.2);">
                    ${shortName}
                </div>
                <div style="font-size: 1.2rem; font-weight: 900; margin-bottom: 8px; color: #fff; letter-spacing: -0.5px;">
                    ${v.headsign || v.h || 'Bus Route'}
                </div>
                <div style="font-size: 0.8rem; border-top: 1px solid rgba(255,255,255,0.1); padding-top: 10px; margin-top: 5px; opacity: 0.7;">
                    ID: ${markerId}
                </div>
            `;

          activePopup.current = new maplibregl.Popup({ closeButton: true, className: 'bus-popup-native' })
            .setLngLat([lng, lat])
            .setDOMContent(popupEl)
            .addTo(map.current);

          onVehicleClick?.(v);
        };

        const marker = new maplibregl.Marker({ element: el })
          .setLngLat([lng, lat])
          .addTo(map.current);

        busMarkers.current[markerId] = marker;
      }
    });
  }, [vehicles]);

  // Efficient GeoJSON Update for Stops
  useEffect(() => {
    if (!map.current) return;
    const source = map.current.getSource('stops-source');
    if (!source) return;

    if (!showStops || stops.length === 0) {
      source.setData({ type: 'FeatureCollection', features: [] });
      return;
    }

    source.setData({
      type: 'FeatureCollection',
      features: stops.map(stop => ({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [stop.lon, stop.lat] },
        properties: { ...stop }
      }))
    });
  }, [stops, showStops]);

  // Handle React Portal-like rendering for Stop Popup content
  const [popupPortal, setPopupPortal] = useState(null);
  useEffect(() => {
    if (selectedStop && activePopup.current) {
      const container = document.getElementById(`popup-${selectedStop.stop_id}`);
      if (container) {
        setPopupPortal({ container, stop: selectedStop });
      }
    } else {
      setPopupPortal(null);
    }
  }, [selectedStop, arrivals, activePopup.current]);

  return (
    <div className="map-wrapper-v2">
      <div ref={mapContainer} className="map-container-v2" />

      <div className="map-controls-custom">
        <button
          id="my-location-btn"
          className="btn-overlay"
          onClick={() => {
            if (map.current) {
              navigator.geolocation.getCurrentPosition(pos => {
                const { longitude, latitude } = pos.coords;
                map.current.flyTo({
                  center: [longitude, latitude],
                  zoom: 15,
                  essential: true
                });

                // Add or update User Marker
                if (userMarker.current) userMarker.current.remove();
                const el = document.createElement('div');
                el.className = 'user-marker-pulse';
                userMarker.current = new maplibregl.Marker({ element: el })
                  .setLngLat([longitude, latitude])
                  .addTo(map.current);
              });
            }
          }}
          title={t.my_location}
        >
          <span>🎯</span>
        </button>
        <button
          className={`btn-overlay ${showStops ? 'active' : ''}`}
          onClick={() => setShowStops(!showStops)}
          title={t.show_stops}
        >
          <span>{showStops ? '✕' : '🚏'}</span>
        </button>
        <button
          className={`btn-overlay ${isSatellite ? 'active' : ''}`}
          onClick={() => setIsSatellite(!isSatellite)}
          title={isSatellite ? t.streetView : t.satelliteView}
        >
          <span>{isSatellite ? '🏙️' : '🛰️'}</span>
        </button>
      </div>

      {showStops && mapZoom < 15 && (
        <div className="zoom-hint-pill">
          {t.zoomInToSeeStops || 'Zoom in to see stops'}
        </div>
      )}

      {selectedStop && popupPortal && (
        <React.Fragment>
          {require('react-dom').createPortal(
            <TimetablePopup
              stop={selectedStop}
              arrivals={arrivals}
              onSelectRoute={onSelectRoute}
              favorites={favorites}
              onToggleFavorite={toggleFavorite}
              t={t}
              routes={routes}
            />,
            popupPortal.container
          )}
        </React.Fragment>
      )}

      <style jsx>{`
        .map-wrapper-v2 {
          position: absolute;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          background: #0a0a12;
        }
        .map-container-v2 {
          width: 100%;
          height: 100%;
        }
        
        :global(.balloon-bus-marker) {
          display: flex;
          flex-direction: column;
          align-items: center;
          width: 40px;
          height: 60px;
        }
        :global(.balloon-label) {
          padding: 2px 8px;
          border-radius: 10px;
          color: white;
          font-weight: 900;
          font-size: 0.7rem;
          margin-bottom: 2px;
          box-shadow: 0 2px 5px rgba(0,0,0,0.3);
          border: 1px solid rgba(255,255,255,0.3);
          white-space: nowrap;
        }
        :global(.rotated-bus-wrapper) {
          transition: transform 0.3s ease;
        }

        :global(.maplibregl-popup-content) {
          background: rgba(20, 20, 25, 0.9);
          backdrop-filter: blur(15px);
          border: 1px solid rgba(255,255,255,0.1);
          border-radius: 15px;
          padding: 15px;
          box-shadow: 0 10px 25px rgba(0,0,0,0.5);
        }
        :global(.maplibregl-popup-tip) {
          border-top-color: rgba(20, 20, 25, 0.9);
        }
        :global(.maplibregl-popup-close-button) {
          color: white;
          font-size: 1.2rem;
          padding: 5px;
        }

        :global(.user-marker-pulse) {
          width: 20px;
          height: 20px;
          background: #0070f3;
          border: 2px solid white;
          border-radius: 50%;
          box-shadow: 0 0 15px #0070f3;
          position: relative;
        }
        :global(.user-marker-pulse::after) {
          content: '';
          position: absolute;
          top: -10px;
          left: -10px;
          width: 40px;
          height: 40px;
          border: 2px solid #0070f3;
          border-radius: 50%;
          animation: user-pulse 2s infinite;
        }
        @keyframes user-pulse {
          0% { transform: scale(0.5); opacity: 1; }
          100% { transform: scale(1.5); opacity: 0; }
        }

        .zoom-hint-pill {
          position: fixed;
          top: 100px;
          left: 50%;
          transform: translateX(-50%);
          background: #000;
          color: white;
          padding: 10px 20px;
          border-radius: 40px;
          font-weight: bold;
          font-size: 0.8rem;
          border: 2px solid #ff3366;
          z-index: 9999;
          pointer-events: none;
          box-shadow: 0 5px 25px rgba(0,0,0,0.8);
          max-width: 250px;
          width: auto;
          text-align: center;
          white-space: nowrap;
        }

        :global(.maplibregl-popup-content) {
          background: #0f0f15 !important;
          border-radius: 20px !important;
          padding: 16px !important;
          border: 1px solid rgba(255,255,255,0.1) !important;
          box-shadow: 0 10px 40px rgba(0,0,0,0.7) !important;
        }

        .stop-popup-v4 {
          color: white;
          width: 300px;
        }
        .popup-top {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 15px;
          padding-right: 25px;
        }
        .stop-title-area h3 {
          margin: 0;
          font-size: 1.1rem;
          letter-spacing: -0.02em;
        }
        .stop-code {
          font-size: 0.7rem;
          opacity: 0.5;
        }
        .fav-pill-btn {
          background: rgba(255,255,255,0.05);
          border: none;
          padding: 6px;
          border-radius: 12px;
          cursor: pointer;
        }
        .arrivals-scroll {
          max-height: 250px;
          overflow-y: auto;
        }
        .bus-row {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 10px;
          background: rgba(255,255,255,0.02);
          margin-bottom: 8px;
          border-radius: 14px;
          cursor: pointer;
        }
        .bus-badge {
          width: 38px;
          height: 38px;
          min-width: 38px;
          border-radius: 10px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-weight: 800;
          font-size: 0.9rem;
        }
        .bus-dest {
          flex: 1;
          font-size: 0.85rem;
          font-weight: 500;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .bus-eta {
          text-align: right;
        }
        .abs-time {
          display: block;
          font-size: 0.85rem;
          font-weight: 700;
        }
        .rel-time {
          font-size: 0.7rem;
          color: #ff3366;
          font-weight: bold;
        }
      `}</style>
    </div>
  );
}
