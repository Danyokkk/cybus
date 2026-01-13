'use client';

import { MapContainer, TileLayer, Marker, Popup, Polyline, CircleMarker, useMapEvents, LayersControl, useMap, ZoomControl } from 'react-leaflet';
import MarkerClusterGroup from 'react-leaflet-cluster';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { useEffect, useState, useRef, useMemo, memo, useCallback } from 'react';
import { useLanguage } from '../context/LanguageContext';

import iconRetinaUrl from 'leaflet/dist/images/marker-icon-2x.png';
import iconUrl from 'leaflet/dist/images/marker-icon.png';
import shadowUrl from 'leaflet/dist/images/marker-shadow.png';

// Custom Icon definition
const customIcon = new L.Icon({
    iconUrl: iconUrl.src || iconUrl,
    iconRetinaUrl: iconRetinaUrl.src || iconRetinaUrl,
    shadowUrl: shadowUrl.src || shadowUrl,
    iconSize: [25, 41],
    iconAnchor: [12, 41],
    popupAnchor: [1, -34],
    shadowSize: [41, 41]
});

const busIcon = new L.Icon({
    iconUrl: '/images/bus_blue.png',
    iconSize: [32, 32],
    iconAnchor: [16, 16],
    popupAnchor: [0, -16],
});

// Deep Nebula "Ultra-Visible" Purple Stop Icon
const stopIcon = L.divIcon({
    className: 'custom-stop-icon',
    html: '<div style="background: linear-gradient(135deg, #4834d4, #6a0572); width: 18px; height: 18px; border-radius: 50%; border: 3px solid #fff; box-shadow: 0 0 15px #4834d4, 0 0 25px rgba(72, 52, 212, 0.4); display: flex; align-items: center; justify-content: center;"><div style="width: 6px; height: 6px; background: white; border-radius: 50%;"></div></div>',
    iconSize: [24, 24],
    iconAnchor: [12, 12],
    popupAnchor: [0, -12]
});

// User Location "Radar" Icon - Fat Neon Green
const userLocationIcon = L.divIcon({
    className: 'custom-user-location-icon',
    html: '<div style="background: #39ff14; width: 22px; height: 22px; border-radius: 50%; border: 4px solid #fff; box-shadow: 0 0 20px #39ff14, 0 0 40px rgba(57, 255, 20, 0.4); animation: sonar 2s infinite;"></div>',
    iconSize: [28, 28],
    iconAnchor: [14, 14]
});

const TimetablePopup = ({ stop, routes, onSelectRoute }) => {
    const [arrivals, setArrivals] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        setLoading(true);
        fetch(`https://cyfinal.onrender.com/api/stops/${stop.stop_id}/timetable`)
            .then(res => res.json())
            .then(data => {
                const now = new Date();
                const currentTime = now.toTimeString().split(' ')[0]; // HH:MM:SS

                // Filter: Upcoming AND within 60 minutes
                const upcoming = data.filter(a => {
                    if (a.arrival_time < currentTime) return false;

                    const [h, m] = a.arrival_time.split(':');
                    const busTime = new Date();
                    busTime.setHours(h, m, 0);
                    const diffMins = (busTime - now) / 60000;

                    return diffMins <= 60;
                });

                setArrivals(upcoming.slice(0, 10));
                setLoading(false);
            })
            .catch(() => setLoading(false));
    }, [stop.stop_id]);

    const uniqueRoutes = [...new Set(arrivals.map(a => a.route_short_name))];

    if (loading) return <div style={{ minWidth: '320px', padding: '20px', textAlign: 'center', color: '#fff', fontWeight: 'bold' }}>Loading arrivals...</div>;

    return (
        <div style={{ minWidth: '320px', maxWidth: '350px', color: '#fff' }}>
            <h3 style={{ margin: '0 0 5px 0', fontSize: '1.2rem', color: '#fff', fontWeight: '900', letterSpacing: '-0.5px' }}>{stop.name}</h3>
            <div style={{ fontSize: '0.75rem', color: '#888', marginBottom: '12px', fontWeight: 'bold' }}>STOP ID: {stop.stop_id}</div>

            {uniqueRoutes.length > 0 && (
                <div style={{ marginBottom: '10px' }}>
                    <div style={{ fontSize: '0.75rem', fontWeight: 'bold', marginBottom: '4px' }}>Routes stopping here:</div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                        {uniqueRoutes.map(shortName => {
                            // Match using 'short_name' (from server) or fallback
                            const routeInfo = routes.find(r => r.short_name === shortName || r.route_short_name === shortName);
                            // Use 'color' (server) or 'route_color'
                            const color = routeInfo ? `#${routeInfo.color || routeInfo.route_color}` : '#0070f3';
                            const textColor = routeInfo ? `#${routeInfo.text_color || routeInfo.route_text_color}` : 'white';

                            return (
                                <span
                                    key={shortName}
                                    onClick={(e) => {
                                        e.stopPropagation(); // Prevent map click
                                        if (routeInfo) onSelectRoute(routeInfo);
                                    }}
                                    style={{
                                        backgroundColor: color,
                                        color: textColor,
                                        padding: '4px 10px',
                                        borderRadius: '6px',
                                        fontSize: '0.8rem',
                                        cursor: routeInfo ? 'pointer' : 'default',
                                        fontWeight: 'bold',
                                        boxShadow: '0 1px 2px rgba(0,0,0,0.1)',
                                        transition: 'transform 0.1s',
                                        display: 'inline-block'
                                    }}
                                    onMouseEnter={(e) => e.target.style.transform = 'scale(1.05)'}
                                    onMouseLeave={(e) => e.target.style.transform = 'scale(1)'}
                                    title={routeInfo ? `View Route ${shortName}` : ''}
                                >
                                    {shortName}
                                </span>
                            );
                        })}
                    </div>
                </div>
            )}

            <table style={{ width: '100%', fontSize: '0.85rem', borderCollapse: 'collapse', color: '#ddd' }}>
                <thead>
                    <tr style={{ borderBottom: '1px solid var(--glass-border)', textAlign: 'left', color: '#fff', opacity: 0.6, fontSize: '0.7rem', textTransform: 'uppercase' }}>
                        <th style={{ padding: '8px 4px' }}>⏳ Time</th>
                        <th style={{ padding: '8px 4px' }}>🚌 Route</th>
                        <th style={{ padding: '8px 4px' }}>📍 Dest.</th>
                        <th style={{ padding: '8px 4px' }}>Status</th>
                    </tr>
                </thead>
                <tbody>
                    {arrivals.length === 0 ? (
                        <tr><td colSpan="4" style={{ padding: '15px', textAlign: 'center', color: '#888' }}>No buses in the next hour.</td></tr>
                    ) : (
                        arrivals.map((arr, i) => {
                            const now = new Date();
                            const [h, m] = arr.arrival_time.split(':');
                            const busTime = new Date();
                            busTime.setHours(h, m, 0);
                            const diff = Math.floor((busTime - now) / 60000);
                            const timeDisplay = diff >= 0 ? `${diff}m` : arr.arrival_time.slice(0, 5);

                            const routeInfo = routes.find(r => r.short_name === arr.route_short_name || r.route_short_name === arr.route_short_name);

                            return (
                                <tr key={i} style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.05)' }}>
                                    <td style={{ padding: '10px 4px', fontWeight: '900', color: '#fff' }}>{timeDisplay}</td>
                                    <td style={{ padding: '10px 4px' }}>
                                        <span
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                if (routeInfo) onSelectRoute(routeInfo);
                                            }}
                                            style={{
                                                background: 'rgba(72, 52, 212, 0.2)',
                                                padding: '4px 8px',
                                                borderRadius: '6px',
                                                border: '1px solid rgba(72, 52, 212, 0.4)',
                                                color: '#fff',
                                                cursor: routeInfo ? 'pointer' : 'default',
                                                fontSize: '0.8rem',
                                                fontWeight: '900'
                                            }}
                                        >
                                            {arr.route_short_name}
                                        </span>
                                    </td>
                                    <td style={{ padding: '10px 4px', color: '#bbb' }}>{arr.trip_headsign}</td>
                                    <td style={{ padding: '10px 4px', color: arr.is_realtime ? '#fff' : '#666', fontWeight: 'bold' }}>
                                        {arr.is_realtime ? '● Live' : 'Sched.'}
                                    </td>
                                </tr>
                            );
                        })
                    )}
                </tbody>
            </table>
        </div>
    );
};

// Icon Cache to prevent redundant divIcon creation
const iconCache = new Map();

// Custom Bus Icon Generator (Balloon Label + Rotated Bus)
const createBusIcon = (routeShortName, bearing = 0, color = '#44bd32', zoom = 15) => {
    // Quantize bearing to 10-degree steps to reduce cache size and re-mounts
    const qBearing = Math.round((bearing || 0) / 10) * 10;
    // Dynamic scale to keep buses "readable" even when zoomed out (doesn't shrink as much as map)
    const scale = zoom < 12 ? 0.8 : zoom < 14 ? 0.9 : 1.0;

    const key = `${routeShortName}_${qBearing}_${color}_${scale}`;
    if (iconCache.has(key)) return iconCache.get(key);

    const icon = L.divIcon({
        className: 'custom-bus-marker-container',
        html: `
            <div class="balloon-bus-marker">
                <div class="balloon-label" style="background-color: ${color};">
                    ${routeShortName || '?'}
                </div>
                <div class="rotated-bus-wrapper" style="transform: rotate(${(qBearing || 0) + 180}deg) scale(${scale})">
                    <img src="/images/busicon.png" class="bus-image-core" />
                </div>
            </div>
        `,
        iconSize: [60, 90],
        iconAnchor: [30, 70],
        popupAnchor: [0, -70]
    });

    iconCache.set(key, icon);
    // Limit cache size
    if (iconCache.size > 1000) {
        const firstKey = iconCache.keys().next().value;
        iconCache.delete(firstKey);
    }

    return icon;
};

// Memoized Bus Marker Component to prevent re-renders unless data changes
const BusMarker = memo(({ id, lat, lon, bearing, shortName, color, speed, headsign, agency, isFirstLoad, isNew, onVehicleClick, t, rawVehicle }) => {
    const routeInfo = useMemo(() => null, []); // Placeholder or logic to find route if needed, but we have color/shortName from backend

    const vColor = color || '#44bd32';
    // Text color logic could be simplified or passed from props
    const vTextColor = 'white';

    return (
        <Marker
            position={[lat, lon]}
            icon={createBusIcon(shortName, bearing, vColor, 15)} // Default zoom scale in popup
            className="smooth-move"
            eventHandlers={{
                click: () => {
                    if (onVehicleClick) onVehicleClick(rawVehicle);
                }
            }}
        >
            <Popup className="bus-popup" minWidth={200}>
                <div style={{ textAlign: 'center', minWidth: '180px', padding: '5px' }}>
                    <div style={{
                        backgroundColor: vColor,
                        color: vTextColor,
                        padding: '10px 18px',
                        borderRadius: '25px',
                        display: 'inline-block',
                        fontSize: '1.3rem',
                        fontWeight: '900',
                        marginBottom: '12px',
                        boxShadow: '0 3px 8px rgba(0,0,0,0.3)',
                        border: '2px solid rgba(255,255,255,0.2)'
                    }}>
                        {shortName || '?'}
                    </div>
                    <div style={{ fontSize: '1.2rem', fontWeight: '900', marginBottom: '8px', color: '#fff', letterSpacing: '-0.5px' }}>
                        {headsign || 'Bus Route'}
                    </div>
                    <div style={{ textAlign: 'left', fontSize: '0.85rem', marginTop: '14px', borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: '14px' }}>
                        <div style={{ marginBottom: '8px' }}><strong style={{ color: '#aaa', fontSize: '0.7rem', textTransform: 'uppercase' }}>ID:</strong> <span style={{ fontFamily: 'monospace', color: '#fff' }}>{id}</span></div>
                        <div style={{ marginBottom: '8px' }}><strong style={{ color: '#aaa', fontSize: '0.7rem', textTransform: 'uppercase' }}>Operator:</strong> <span style={{ color: '#fff' }}>{agency || 'CPT'}</span></div>
                        <div style={{ marginBottom: '6px', color: '#4834d4' }}>
                            <strong style={{ color: '#aaa', fontSize: '0.7rem', textTransform: 'uppercase' }}>{t?.speed || 'Speed'}:</strong> {(speed ? (speed * 3.6).toFixed(1) : '0.0')} km/h
                        </div>
                    </div>
                </div>
            </Popup>
        </Marker>
    );
});

const MapEvents = ({ map, setMapZoom, updateVisibleElements, shapes, onSelectRoute }) => {
    useMapEvents({
        movestart: () => {
            if (map?._container) map._container.classList.add('map-moving');
        },
        moveend: () => {
            setMapZoom(map.getZoom());
            updateVisibleElements();
            if (map?._container) map._container.classList.remove('map-moving');
        },
        zoomstart: () => {
            if (map?._container) map._container.classList.add('map-moving');
        },
        zoomend: () => {
            setMapZoom(map.getZoom());
            updateVisibleElements();
            if (map?._container) map._container.classList.remove('map-moving');
        },
        popupclose: (e) => {
            if (e.popup.options.className === 'bus-popup') {
                if (onSelectRoute) onSelectRoute(null);
            }
        }
    });

    // Auto-Zoom to Route Shapes
    useEffect(() => {
        if (shapes && shapes.length > 0 && map) {
            const allPoints = shapes.flat();
            if (allPoints.length > 0) {
                map.fitBounds(allPoints, { padding: [50, 50], animate: true });
            }
        }
    }, [shapes, map]);

    return null;
};

export default function BusMap({ stops, shapes, routes, onSelectRoute, routeColor, onVehicleClick, vehicles, showToast }) {
    const [showStops, setShowStops] = useState(false);
    const [isFirstLoad, setIsFirstLoad] = useState(true);
    const [mapZoom, setMapZoom] = useState(10);
    const [visibleVehicles, setVisibleVehicles] = useState([]);
    const [visibleStops, setVisibleStops] = useState([]);
    const [userLoc, setUserLoc] = useState(null);
    const [locLoading, setLocLoading] = useState(false);
    const [isSatellite, setIsSatellite] = useState(true);
    const seenVehicles = useRef(new Set());

    const mapRef = useRef(null);
    const { t } = useLanguage();

    // 1. Map Events Handling Logic
    const updateVisibleElements = useCallback(() => {
        if (!mapRef.current) return;
        const m = mapRef.current;
        const bounds = m.getBounds();
        const zoom = m.getZoom();
        const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;

        const buffer = isMobile ? 0.05 : 0.15;
        const paddedBounds = bounds.pad(buffer);

        // Filter vehicles
        if (Array.isArray(vehicles)) {
            const filteredVehicles = vehicles.filter(v => {
                if (!v) return false;
                const lat = v.lt !== undefined ? v.lt : v.lat;
                const lon = v.ln !== undefined ? v.ln : v.lon;
                if (lat === undefined || lon === undefined) return false;
                try {
                    return paddedBounds.contains([lat, lon]);
                } catch (e) { return false; }
            });
            setVisibleVehicles(filteredVehicles);
        }

        // Filter stops
        if (showStops && zoom >= 14 && Array.isArray(stops)) {
            const filteredStops = stops.filter(s =>
                s && s.lat !== undefined && s.lon !== undefined &&
                paddedBounds.contains([s.lat, s.lon])
            );
            setVisibleStops(filteredStops);
        } else {
            setVisibleStops([]);
        }
    }, [vehicles, showStops, stops]);

    // Update visibility when source data or settings change
    useEffect(() => {
        updateVisibleElements();
    }, [vehicles, showStops, stops]);

    // Instant Spawn Logic
    useEffect(() => {
        if (Array.isArray(vehicles) && vehicles.length > 0 && isFirstLoad) {
            vehicles.forEach(v => seenVehicles.current.add(v.id || v.vehicle_id));
            const timer = setTimeout(() => setIsFirstLoad(false), 1000);
            return () => clearTimeout(timer);
        }
    }, [vehicles, isFirstLoad]);

    // Geolocation - Strict iOS Compliance
    // We attach a raw DOM event listener in useEffect to bypass React synthetic events
    // just in case strict mode requires "real" events.
    useEffect(() => {
        const btn = document.getElementById('my-location-btn');
        if (!btn) return;

        const handleLocClick = (e) => {
            e.preventDefault(); // Stop any other handlers

            if (!navigator.geolocation) {
                alert("Geolocation is not supported by your browser");
                return;
            }

            setLocLoading(true);

            navigator.geolocation.getCurrentPosition(
                (pos) => {
                    const { latitude, longitude } = pos.coords;
                    setUserLoc([latitude, longitude]);
                    setLocLoading(false);
                    setShowStops(true);
                    if (mapRef.current) mapRef.current.setView([latitude, longitude], 15, { animate: true });
                },
                (err) => {
                    setLocLoading(false);
                    console.error("Geo error:", err);
                    alert("Location access denied. Check Settings > Privacy > Location Services > Safari Websites.");
                },
                { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
            );
        };

        btn.addEventListener('click', handleLocClick);
        return () => btn.removeEventListener('click', handleLocClick);
    }, []);

    return (
        <div style={{ position: 'relative', height: '100%', width: '100%' }}>
            <div style={{ position: 'absolute', top: '100px', right: '25px', zIndex: 1000, display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <button onClick={() => setIsSatellite(!isSatellite)} className="stops-toggle-btn" title={isSatellite ? t.streetView : t.satelliteView}>
                    <span>{isSatellite ? '🏙️' : '🛰️'}</span>
                </button>
                <button onClick={() => setShowStops(!showStops)} className={`stops-toggle-btn ${showStops ? 'active' : ''}`} title={showStops ? t.hideStops : t.showStops}>
                    <span>{showStops ? '✕' : '🚏'}</span>
                </button>
                <button id="my-location-btn" className="stops-toggle-btn" title={t.myLocation}>
                    <span>{locLoading ? '⌛' : '🎯'}</span>
                </button>
                <button
                    onClick={() => {
                        if (confirm("Reboot site and refresh all data?")) {
                            window.location.reload(true);
                        }
                    }}
                    className="stops-toggle-btn"
                    title="Force Reload Site"
                    style={{ opacity: 0.6, transform: 'scale(0.85)' }}
                >
                    <span style={{ fontSize: '1rem' }}>🔃</span>
                </button>
            </div>

            <MapContainer
                center={[35.1264, 33.4299]}
                zoom={10}
                style={{ height: '100%', width: '100%' }}
                preferCanvas={true}
                ref={mapRef}
                zoomControl={false}
            >
                <ZoomControl position="bottomright" />
                <MapEvents
                    map={mapRef.current}
                    setMapZoom={setMapZoom}
                    updateVisibleElements={updateVisibleElements}
                    shapes={shapes}
                    onSelectRoute={onSelectRoute}
                />

                {isSatellite ? (
                    <>
                        <TileLayer url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}" />
                        <TileLayer url="https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}" />
                    </>
                ) : (
                    <TileLayer
                        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
                        url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
                        maxZoom={20}
                    />
                )}

                {shapes && shapes.length > 0 && shapes.map((shape, index) => (
                    <Polyline key={`shape-${index}`} positions={shape} pathOptions={{ color: routeColor ? (routeColor.startsWith('#') ? routeColor : '#' + routeColor) : '#0070f3', weight: 6, opacity: 0.9 }} />
                ))}

                {showStops && mapZoom < 14 && (
                    <div className="zoom-hint-pill">
                        {t.zoomInToSeeStops || 'Zoom in to see stops'}
                    </div>
                )}

                {showStops && mapZoom >= 14 && visibleStops.map((stop) => (
                    <Marker key={`stop-${stop.stop_id}`} position={[stop.lat, stop.lon]} icon={stopIcon}>
                        <Popup minWidth={300}>
                            <TimetablePopup stop={stop} routes={routes || []} onSelectRoute={onSelectRoute} />
                        </Popup>
                    </Marker>
                ))}

                {visibleVehicles.map((v, i) => {
                    const vId = v.id || v.vehicle_id;
                    const vColor = v.c || '44bd32';
                    return (
                        <Marker
                            key={`bus-${vId || i}`}
                            position={[v.lt || v.lat, v.ln || v.lon]}
                            icon={createBusIcon(v.sn || v.route_short_name, v.b !== undefined ? v.b : v.bearing, vColor.startsWith('#') ? vColor : '#' + vColor, mapZoom)}
                            eventHandlers={{ click: () => onVehicleClick(v) }}
                            className="smooth-move"
                        >
                            <Popup className="bus-popup" minWidth={200}>
                                <div style={{ textAlign: 'center', minWidth: '180px', padding: '5px' }}>
                                    <div style={{ backgroundColor: vColor.startsWith('#') ? vColor : '#' + vColor, color: 'white', padding: '10px 18px', borderRadius: '25px', display: 'inline-block', fontSize: '1.3rem', fontWeight: '900', marginBottom: '12px' }}>
                                        {v.sn || v.route_short_name || '?'}
                                    </div>
                                    <div style={{ fontSize: '1.2rem', fontWeight: '900', color: '#fff' }}>{v.h || v.trip_headsign || 'Bus Route'}</div>
                                    <div style={{ textAlign: 'left', fontSize: '0.85rem', marginTop: '14px', borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: '14px' }}>
                                        <div><strong style={{ color: '#aaa', fontSize: '0.7rem' }}>SPEED:</strong> {(v.s ? (v.s * 3.6).toFixed(1) : '0.0')} km/h</div>
                                    </div>
                                </div>
                            </Popup>
                        </Marker>
                    );
                })}

                {userLoc && (
                    <Marker position={userLoc} icon={userLocationIcon} zIndexOffset={1000}>
                        <Popup><div>You are here</div></Popup>
                    </Marker>
                )}
            </MapContainer>
        </div>
    );
}
