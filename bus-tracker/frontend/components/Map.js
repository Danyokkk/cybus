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

// Hyper-Engine Config
const MAP_STYLE = 'https://tiles.openfreemap.org/styles/bright'; // Simple white map
const CYPRUS_BOUNDS = [[32.2, 34.5], [34.7, 35.7]];

const TimetablePopup = ({ stop, arrivals, onSelectRoute, favorites, onToggleFavorite, t, routes }) => {
    const isFavorite = favorites?.some(f => f.stop_id === stop.stop_id);

    return (
        <div className="timetable-popup-content" style={{ minWidth: '280px', color: '#fff' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '15px' }}>
                <div>
                    <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: '900' }}>{stop.name}</h3>
                    <code style={{ fontSize: '0.7rem', color: '#aaa' }}>{stop.stop_id}</code>
                </div>
                <button 
                    onClick={(e) => { e.stopPropagation(); onToggleFavorite(stop); }}
                    style={{ background: 'transparent', border: 'none', cursor: 'pointer' }}
                >
                    <Heart size={20} fill={isFavorite ? "#ff0033" : "transparent"} color={isFavorite ? "#ff0033" : "#fff"} />
                </button>
            </div>

            <div style={{ maxHeight: '250px', overflowY: 'auto' }}>
                {!arrivals ? (
                    <div style={{ padding: '20px', textAlign: 'center' }}>{t.loading || 'Loading...'}</div>
                ) : arrivals.length === 0 ? (
                    <div style={{ padding: '20px', textAlign: 'center', color: '#ff0033' }}>{t.no_buses || 'No arrivals'}</div>
                ) : (
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <tbody>
                            {arrivals.slice(0, 10).map((arr, idx) => {
                                const route = routes?.find(r => r.route_id === arr.route_id);
                                return (
                                    <tr key={`${arr.route_id}-${idx}`} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                                        <td style={{ padding: '8px 0' }}>
                                            <span 
                                                onClick={() => route && onSelectRoute(route)}
                                                style={{ 
                                                    background: route?.color ? `#${route.color}` : '#ff0033',
                                                    padding: '2px 8px',
                                                    borderRadius: '6px',
                                                    fontWeight: 'bold',
                                                    fontSize: '0.8rem',
                                                    cursor: route ? 'pointer' : 'default'
                                                }}
                                            >
                                                {arr.route_short_name}
                                            </span>
                                        </td>
                                        <td style={{ padding: '8px 4px', fontSize: '0.85rem' }}>{arr.trip_headsign}</td>
                                        <td style={{ padding: '8px 0', textAlign: 'right', fontWeight: 'bold' }}>{arr.arrival_time}</td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
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
      // If map already exists, just update style to avoid re-initializing
      map.current.setStyle(isSatellite ? 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}/style.json' || 'https://tiles.openfreemap.org/styles/bright' : MAP_STYLE);
      return;
    }

    map.current = new maplibregl.Map({
      container: mapContainer.current,
      style: isSatellite ? 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}/style.json' || 'https://tiles.openfreemap.org/styles/bright' : MAP_STYLE,
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
          id: 'route-line-glow',
          type: 'line',
          source: 'route-source',
          layout: { 'line-join': 'round', 'line-cap': 'round' },
          paint: {
            'line-color': routeColor || '#ff0033',
            'line-width': 8,
            'line-opacity': 0.3,
            'line-blur': 4
          }
        });

        map.current.addLayer({
          id: 'route-line',
          type: 'line',
          source: 'route-source',
          layout: { 'line-join': 'round', 'line-cap': 'round' },
          paint: {
            'line-color': routeColor || '#ff0033',
            'line-width': 4
          }
        });
      }

      // Add Satellite Raster Source if in satellite mode
      if (isSatellite && !map.current.getSource('satellite')) {
        map.current.addSource('satellite', {
          type: 'raster',
          tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'],
          tileSize: 256
        });
        map.current.addLayer({ id: 'satellite-layer', type: 'raster', source: 'satellite' }, 'route-line-glow');
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

  // Handle Vehicles (Buses)
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
      const bearing = parseFloat(v.bearing || v.ag || 0);
      const markerId = v._id || v.vehicle_id || v.id;

      // SAFETY GUARD: skip invalid coordinates to prevent site crash
      if (isNaN(lat) || isNaN(lng)) {
        console.warn(`Skipping vehicle ${markerId} due to invalid coordinates:`, v);
        return;
      }

      if (busMarkers.current[markerId]) {
        busMarkers.current[markerId].setLngLat([lng, lat]);
        const el = busMarkers.current[markerId].getElement();
        
        const wrapper = el.querySelector('.rotated-bus-wrapper');
        if (wrapper && !isNaN(bearing)) {
            wrapper.style.transform = `rotate(${bearing}deg)`;
        }
      } else {
        const busColor = v.color || '#ff0033';
        const el = document.createElement('div');
        el.className = 'bus-marker-v2';
        el.innerHTML = `
            <div class="balloon-bus-marker">
                <div class="balloon-label" style="background-color: ${busColor};">
                    ${v.route_short_name || v.sn || '?'}
                </div>
                <div class="rotated-bus-wrapper" style="transform: rotate(${(bearing || 0)}deg)">
                    <svg viewBox="0 0 50 100" xmlns="http://www.w3.org/2000/svg" style="width: 16px; height: 32px; filter: drop-shadow(0 1.5px 3px rgba(0,0,0,0.4));">
                        <rect x="5" y="5" width="40" height="90" rx="10" fill="${busColor}" stroke="white" stroke-width="4" />
                        <path d="M10 15 Q25 10 40 15 L40 30 Q25 35 10 30 Z" fill="rgba(0,0,0,0.8)" />
                        <rect x="15" y="45" width="20" height="25" rx="3" fill="rgba(255,255,255,0.2)" />
                        <circle cx="15" cy="10" r="3" fill="#fffb00" />
                        <circle cx="35" cy="10" r="3" fill="#fffb00" />
                    </svg>
                </div>
            </div>
        `;

        el.onclick = () => {
            if (activePopup.current) activePopup.current.remove();
            
            const popupEl = document.createElement('div');
            // Simplified bus popup info
            popupEl.innerHTML = `
                <div style="text-align: center; color: #fff; padding: 10px;">
                    <div style="background: ${busColor}; padding: 5px 15px; border-radius: 20px; display: inline-block; font-weight: bold; margin-bottom: 8px;">
                        ${v.route_short_name || v.sn || '?'}
                    </div>
                    <div style="font-weight: bold;">${v.headsign || v.h || 'Bus'}</div>
                    <div style="font-size: 0.8rem; margin-top: 5px; opacity: 0.7;">ID: ${v.vehicle_id}</div>
                </div>
            `;

            activePopup.current = new maplibregl.Popup({ closeButton: false, className: 'bus-popup-native' })
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

  // Handle Stops
  useEffect(() => {
    if (!map.current) return;

    // Clear old stops
    stopMarkers.current.forEach(m => m.remove());
    stopMarkers.current = [];

    if (!showStops || mapZoom < 15) return;

    stops.forEach(stop => {
      const el = document.createElement('div');
      el.className = 'stop-marker-v2';
      el.innerHTML = `
        <div class="stop-pin-v2">
            <div class="stop-pin-inner">🚌</div>
        </div>
      `;
      el.style.cursor = 'pointer';
      
      el.onclick = async () => {
        if (activePopup.current) activePopup.current.remove();
        
        const popupNode = document.createElement('div');
        popupNode.id = `popup-${stop.stop_id}`;
        
        activePopup.current = new maplibregl.Popup({ maxWidth: '350px', className: 'stop-popup-native' })
            .setLngLat([stop.lon, stop.lat])
            .setDOMContent(popupNode)
            .addTo(map.current);

        // Fetch data
        setArrivals(null);
        try {
          const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'https://cyfinal.onrender.com'}/api/stop_arrivals?stop_id=${stop.stop_id || stop.id}`);
          const data = await res.json();
          setArrivals(data);
          setSelectedStop(stop); // This will trigger the useEffect to render React into the DOM node
        } catch (e) {
          console.error(e);
          setArrivals([]);
        }
      };

      const marker = new maplibregl.Marker({ element: el })
        .setLngLat([stop.lon, stop.lat])
        .addTo(map.current);
        
      stopMarkers.current.push(marker);
    });
  }, [stops, showStops, mapZoom]);

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

      {popupPortal && (
        <div style={{ display: 'none' }}>
            {/* We use a hidden div to render the React component, but then we might need actual Portal logic or just inject it */}
        </div>
      )}
      
      {/* Fallback to simple React-based popup if native DOM injection is hard, but let's try the native way first */}
      {selectedStop && activePopup.current && (
          <div style={{ display: 'none' }}>
              {/* This is a trick: the native popup uses a DOM node we provided, we can 'portal' into it if needed, 
                  but for simplicity let's stick to the custom overlay if the native one is too buggy for React bits.
                  Actually, the user said "поп ап окна не работают". Let's use the native ones properly.
              */}
          </div>
      )}

      {/* Re-implementing the TimetablePopup inside the Native Popup requires caution. 
          I'll use a simpler approach: Injecting the React component into the DOM node of the MapLibre Popup.
      */}
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

        :global(.stop-marker-v2) {
          cursor: pointer;
          width: 32px;
          height: 38px;
        }
        :global(.stop-pin-v2) {
          background: #ff0033;
          width: 32px;
          height: 32px;
          border-radius: 50% 50% 50% 6px;
          transform: rotate(-45deg);
          border: 2px solid white;
          box-shadow: 0 4px 10px rgba(0,0,0,0.5);
          display: flex;
          align-items: center;
          justify-content: center;
        }
        :global(.stop-pin-inner) {
          transform: rotate(45deg);
          color: white;
          font-size: 14px;
        }
        :global(.stop-marker-v2:hover .stop-pin-v2) {
          transform: rotate(-45deg) scale(1.2);
          box-shadow: 0 6px 15px rgba(255,0,51,0.5);
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
          position: absolute;
          top: 80px;
          left: 50%;
          transform: translateX(-50%);
          background: rgba(20, 20, 25, 0.9);
          backdrop-filter: blur(10px);
          padding: 8px 16px;
          border-radius: 20px;
          color: white;
          font-weight: bold;
          font-size: 0.8rem;
          border: 1px solid #ff0033;
          z-index: 100;
          box-shadow: 0 5px 15px rgba(0,0,0,0.5);
        }

        .map-controls-custom {
          position: absolute;
          top: 20px;
          right: 20px;
          display: flex;
          flex-direction: column;
          gap: 10px;
          z-index: 10;
        }
        
        .btn-overlay {
          width: 45px;
          height: 45px;
          background: rgba(20, 20, 25, 0.8);
          backdrop-filter: blur(10px);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 12px;
          display: flex;
          align-items: center;
          justify-content: center;
          color: white;
          cursor: pointer;
          font-size: 1.2rem;
        }
        .btn-overlay.active {
          background: #ff0033;
          border-color: #ff3366;
        }

        .map-popup-overlay {
          position: absolute;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          background: rgba(0,0,0,0.3);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 1000;
        }
        
        .map-popup-card {
          width: 90%;
          max-width: 350px;
          background: rgba(20, 20, 25, 0.95);
          backdrop-filter: blur(20px);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 24px;
          padding: 24px;
          position: relative;
        }
        
        .close-popup {
          position: absolute;
          top: 15px;
          right: 15px;
          background: transparent;
          border: none;
          color: white;
          opacity: 0.5;
        }

        /* Timetable Popup Content styles from original implementation */
        :global(.popup-header) {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          margin-bottom: 20px;
        }
        :global(.arrivals-list) {
          max-height: 300px;
          overflow-y: auto;
        }
        :global(.arrival-item) {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 12px 0;
          border-bottom: 1px solid rgba(255,255,255,0.05);
          cursor: pointer;
        }
        :global(.route-badge) {
          min-width: 40px;
          height: 40px;
          border-radius: 10px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-weight: bold;
          color: white;
        }
        :global(.arrival-details) {
          flex: 1;
        }
        :global(.time) {
          color: #ff0033;
          font-weight: bold;
          font-size: 0.8rem;
          display: block;
        }
        :global(.fav-btn) {
          background: transparent;
          border: none;
          cursor: pointer;
        }
      `}</style>
    </div>
  );
}
