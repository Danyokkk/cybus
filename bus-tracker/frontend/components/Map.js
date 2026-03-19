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

const TimetablePopup = ({ stop, arrivals, onSelectRoute, favorites, onToggleFavorite, t }) => {
  const isFavorite = favorites?.some(f => f.stop_id === stop.stop_id);

  return (
    <div className="timetable-popup-content glass-morphism">
      <div className="popup-header">
        <div className="stop-info">
          <h3>{stop.name || 'Bus Stop'}</h3>
          <span className="stop-id">ID: {stop.stop_id}</span>
        </div>
        <button 
          className={`fav-btn ${isFavorite ? 'active' : ''}`}
          onClick={(e) => {
            e.stopPropagation();
            onToggleFavorite(stop);
          }}
        >
          <Heart size={18} fill={isFavorite ? "#ff0033" : "transparent"} color={isFavorite ? "#ff0033" : "white"} />
        </button>
      </div>

      <div className="arrivals-list">
        {!arrivals ? (
          <div className="loading-arrivals">
            <div className="spinner-small"></div>
            <span>{t.loading || 'Loading...'}</span>
          </div>
        ) : arrivals.length === 0 ? (
          <div className="no-arrivals">{t.no_buses || 'No upcoming buses'}</div>
        ) : (
          arrivals.slice(0, 10).map((arr, idx) => (
            <div 
              key={`${arr.route_id}-${idx}`} 
              className="arrival-item"
              onClick={() => onSelectRoute(arr.route_id)}
            >
              <div className="route-badge" style={{ backgroundColor: arr.route_color || '#ff0033' }}>
                {arr.route_short_name}
              </div>
              <div className="arrival-details">
                <span className="dest">{arr.trip_headsign}</span>
                <span className="time">{arr.arrival_time}</span>
              </div>
              <ChevronRight size={14} opacity={0.5} />
            </div>
          ))
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

  // Initialization
  useEffect(() => {
    if (map.current) return;

    map.current = new maplibregl.Map({
      container: mapContainer.current,
      style: isSatellite ? 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}/style.json' || 'https://tiles.openfreemap.org/styles/bright' : MAP_STYLE,
      center: [33.3613, 35.1856], // Nicosia
      zoom: 13,
      pitch: 0, // Disable 3D pitch for performance
      maxBounds: [[32.0, 34.4], [34.7, 35.7]] // Cyprus bounds
    });

    map.current.addControl(new maplibregl.NavigationControl({ showPitch: false }), 'top-right');
    
    map.current.on('load', () => {
      // Add Satellite if needed
      if (isSatellite) {
        map.current.addSource('satellite', {
          type: 'raster',
          tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'],
          tileSize: 256
        });
        map.current.addLayer({
          id: 'satellite-layer',
          type: 'raster',
          source: 'satellite',
          minzoom: 0,
          maxzoom: 22
        });
      }

      // Route Source
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
    });

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
      const lat = v.lat || v.lt;
      const lng = v.lon || v.ln;
      const bearing = v.bearing || v.ag || 0;
      const markerId = v._id || v.vehicle_id || v.id;

      if (busMarkers.current[markerId]) {
        busMarkers.current[markerId].setLngLat([lng, lat]);
        const el = busMarkers.current[markerId].getElement();
        const balloon = el.querySelector('.bus-balloon');
        if (balloon) balloon.style.transform = `rotate(${bearing - 45}deg)`;
      } else {
        const el = document.createElement('div');
        el.className = 'bus-marker-v2';
        el.innerHTML = `
          <div class="bus-balloon" style="background: ${v.color || '#ff0033'}; transform: rotate(${(bearing || 0) - 45}deg)">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="white" style="transform: rotate(45deg)">
              <path d="M19 17h2v2h-2v-2zm-2 0h-2v2h2v-2zm-4 0h-2v2h2v-2zm-4 0h-2v2h2v-2zm-4 0h-2v2h2v-2zm18-7l-1-2H2L1 10v9h2v-2h18v2h2V10h-1zM4 14H3v-2h1v2zm17 0h-1v-2h1v2zM5 8h14l.5 1H4.5L5 8z"></path>
            </svg>
            <div class="bus-arrow"></div>
          </div>
        `;

        el.onclick = () => onVehicleClick?.(v);

        const marker = new maplibregl.Marker({ element: el })
          .setLngLat([lng, lat])
          .addTo(map.current);
          
        busMarkers.current[v.id] = marker;
      }
    });
  }, [vehicles]);

  // Handle Stops
  useEffect(() => {
    if (!map.current) return;

    // Clear old stops
    stopMarkers.current.forEach(m => m.remove());
    stopMarkers.current = [];

    if (!showStops) return;

    stops.forEach(stop => {
      const el = document.createElement('div');
      el.className = 'stop-marker-v2';
      el.innerHTML = `<div class="stop-dot">🚌</div>`;
      el.style.cursor = 'pointer';
      
      el.onclick = async () => {
        setSelectedStop(stop);
        setArrivals(null);
        try {
          const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'https://cyfinal.onrender.com'}/api/stop_arrivals?stop_id=${stop.stop_id}`);
          const data = await res.json();
          setArrivals(data);
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
  }, [stops, showStops]);

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
                map.current.flyTo({
                  center: [pos.coords.longitude, pos.coords.latitude],
                  zoom: 15,
                  essential: true
                });
              });
            }
          }}
         title={t.my_location}
        >
          <Navigation size={20} />
        </button>
        <button 
          className={`btn-overlay ${showStops ? 'active' : ''}`}
          onClick={() => setShowStops(!showStops)}
          title={t.show_stops}
        >
          <MapPin size={20} />
        </button>
      </div>

      {selectedStop && (
        <div className="map-popup-overlay" onClick={() => setSelectedStop(null)}>
          <div className="map-popup-card" onClick={e => e.stopPropagation()}>
            <button className="close-popup" onClick={() => setSelectedStop(null)}>
              <X size={20} />
            </button>
            <TimetablePopup 
              stop={selectedStop} 
              arrivals={arrivals} 
              onSelectRoute={onSelectRoute}
              favorites={favorites}
              onToggleFavorite={toggleFavorite}
              t={t}
            />
          </div>
        </div>
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
        
        :global(.bus-marker-v2) {
          cursor: pointer;
        }
        :global(.bus-balloon) {
          width: 32px;
          height: 32px;
          border-radius: 50% 50% 50% 0;
          display: flex;
          align-items: center;
          justify-content: center;
          box-shadow: 0 4px 15px rgba(0,0,0,0.5);
          border: 2px solid rgba(255,255,255,0.2);
          transition: transform 0.3s ease-out;
        }
        
        :global(.stop-marker-v2) {
          cursor: pointer;
        }
        :global(.stop-dot) {
          width: 24px;
          height: 24px;
          background: rgba(20, 20, 25, 0.8);
          backdrop-filter: blur(5px);
          border: 1px solid rgba(255,255,255,0.3);
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 12px;
          box-shadow: 0 0 10px rgba(0,0,0,0.5);
        }

        .map-controls-custom {
          position: absolute;
          bottom: 30px;
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
