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

// 3D 🛑 Stop Pin
const stopIcon = L.divIcon({
    className: 'custom-stop-icon',
    html: `
        <div style="
            position: relative;
            width: 32px;
            height: 38px;
            display: flex;
            flex-direction: column;
            align-items: center;
            filter: drop-shadow(0 4px 8px rgba(0,0,0,0.5));
        ">
            <div style="
                background: #ff0033; 
                width: 32px; 
                height: 32px; 
                border-radius: 50% 50% 50% 6px; 
                transform: rotate(-45deg); 
                display: flex;
                align-items: center;
                justify-content: center;
                border: 2px solid white;
            ">
                <div style="
                    background: white; 
                    width: 20px; 
                    height: 20px; 
                    border-radius: 50%; 
                    transform: rotate(45deg);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    box-shadow: inset 0 2px 4px rgba(0,0,0,0.2);
                ">
                    <span style="font-size: 14px;">🚌</span>
                </div>
            </div>
            <div style="width: 14px; height: 4px; background: rgba(0,0,0,0.3); border-radius: 50%; margin-top: -2px;"></div>
        </div>
    `,
    iconSize: [32, 42],
    iconAnchor: [16, 38],
    popupAnchor: [0, -40]
});

// User Location Icon
const userLocationIcon = L.divIcon({
    className: 'custom-user-location-icon',
    html: '<div style="background: #ff0033; width: 18px; height: 18px; border-radius: 50%; border: 3px solid #fff; box-shadow: 0 0 15px rgba(255, 0, 51, 0.6); animation: sonar 2s infinite;"></div>',
    iconSize: [24, 24],
    iconAnchor: [12, 12]
});

const planStartIcon = L.divIcon({
    className: 'custom-plan-icon',
    html: '<div style="background: #ff0033; border: 2px solid white; box-shadow: 0 0 10px rgba(255, 0, 51, 0.5); width: 26px; height: 26px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: 900; color: #fff; font-size: 8px;">START</div>',
    iconSize: [26, 26],
    iconAnchor: [13, 13]
});

const planHubIcon = L.divIcon({
    className: 'custom-plan-icon',
    html: '<div style="background: #e056fd; border: 2px solid white; box-shadow: 0 0 10px #e056fd; width: 30px; height: 30px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: 900; color: #fff; font-size: 10px;">BUS</div>',
    iconSize: [30, 30],
    iconAnchor: [15, 15]
});

const planEndIcon = L.divIcon({
    className: 'custom-plan-icon',
    html: '<div style="background: #ff0033; border: 2px solid white; box-shadow: 0 0 10px #ff0033; width: 30px; height: 30px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: 900; color: #fff; font-size: 10px;">END</div>',
    iconSize: [30, 30],
    iconAnchor: [15, 15]
});

const TimetablePopup = memo(({ stop, routes, onSelectRoute, favorites, onToggleFavorite }) => {
    const [arrivals, setArrivals] = useState([]);
    const [loading, setLoading] = useState(true);
    const isFav = favorites?.includes(stop.stop_id);

    useEffect(() => {
        setLoading(true);
        const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'https://cybus.onrender.com';
        fetch(`${apiUrl}/api/stops/${stop.stop_id}/timetable`)
            .then(res => res.json())
            .then(data => {
                const now = new Date();
                const currentTime = now.toTimeString().split(' ')[0];
                const upcoming = data.filter(a => {
                    if (a.arrival_time < currentTime) return false;
                    const [h, m] = a.arrival_time.split(':');
                    const busTime = new Date();
                    busTime.setHours(h, m, 0);
                    return (busTime - now) / 60000 <= 60;
                });
                setArrivals(upcoming.slice(0, 10));
                setLoading(false);
            })
            .catch(() => setLoading(false));
    }, [stop.stop_id]);

    const uniqueRoutes = useMemo(() => [...new Set(arrivals.map(a => a.route_short_name))], [arrivals]);

    if (loading) return <div style={{ minWidth: '320px', padding: '20px', textAlign: 'center', color: '#fff', fontWeight: 'bold' }}>Loading arrivals...</div>;

    return (
        <div style={{ minWidth: '320px', maxWidth: '350px', color: '#fff' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <h3 style={{ margin: '0 0 5px 0', fontSize: '1.2rem', color: '#fff', fontWeight: '900', letterSpacing: '-0.5px', flex: 1 }}>{stop.name}</h3>
                <button 
                    onClick={(e) => { e.stopPropagation(); onToggleFavorite(stop.stop_id); }}
                    className={`fav-btn ${isFav ? 'active' : ''}`}
                >
                    {isFav ? '⭐' : '☆'}
                </button>
            </div>
            <div style={{ fontSize: '0.75rem', color: '#888', marginBottom: '12px', fontWeight: 'bold' }}>STOP ID: {stop.stop_id}</div>

            {uniqueRoutes.length > 0 && (
                <div style={{ marginBottom: '10px' }}>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                        {uniqueRoutes.map(shortName => {
                            const routeInfo = routes.find(r => r.short_name === shortName || r.route_short_name === shortName);
                            const color = routeInfo ? `#${routeInfo.color || routeInfo.route_color}` : '#0070f3';
                            const textColor = routeInfo ? `#${routeInfo.text_color || routeInfo.route_text_color}` : 'white';
                            return (
                                <span
                                    key={shortName}
                                    onClick={(e) => { e.stopPropagation(); if (routeInfo) onSelectRoute(routeInfo); }}
                                    style={{ backgroundColor: color, color: textColor, padding: '4px 10px', borderRadius: '6px', fontSize: '0.8rem', cursor: 'pointer', fontWeight: 'bold' }}
                                >
                                    {shortName}
                                </span>
                            );
                        })}
                    </div>
                </div>
            )}

            <table style={{ width: '100%', fontSize: '0.85rem', borderCollapse: 'collapse', color: '#ddd' }}>
                <tbody>
                    {arrivals.length === 0 ? (
                        <tr><td style={{ padding: '15px', textAlign: 'center', color: '#888' }}>No buses in the next hour.</td></tr>
                    ) : (
                        arrivals.map((arr, i) => {
                            const routeInfo = routes.find(r => r.short_name === arr.route_short_name || r.route_short_name === arr.route_short_name);
                            const rColor = routeInfo ? (routeInfo.color || routeInfo.route_color) : '4834d4';
                            const badgeColor = rColor.startsWith('#') ? rColor : `#${rColor}`;
                            return (
                                <tr key={i} style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.05)' }}>
                                    <td style={{ padding: '10px 4px', color: '#fff', fontWeight: 'bold' }}>{arr.arrival_time.slice(0, 5)}</td>
                                    <td style={{ padding: '10px 4px' }}>
                                        <span style={{ backgroundColor: badgeColor, padding: '4px 8px', borderRadius: '6px', color: '#fff', fontSize: '0.8rem', fontWeight: '900' }}>{arr.route_short_name}</span>
                                    </td>
                                    <td style={{ padding: '10px 4px', color: '#bbb' }}>{arr.trip_headsign}</td>
                                </tr>
                            );
                        })
                    )}
                </tbody>
            </table>
        </div>
    );
});

// Helper: Determine contrast color
const getContrastYIQ = (hexcolor) => {
    if (!hexcolor) return 'white';
    const hex = hexcolor.replace('#', '');
    const r = parseInt(hex.substr(0, 2), 16);
    const g = parseInt(hex.substr(2, 2), 16);
    const b = parseInt(hex.substr(4, 2), 16);
    const yiq = ((r * 299) + (g * 587) + (b * 114)) / 1000;
    // Lower threshold to favor black text for more colors (especially yellows/pinks)
    return (yiq >= 150) ? 'black' : 'white';
};

const iconCache = new Map();

const createBusIcon = (routeShortName, color = '#44bd32') => {
    const textColor = getContrastYIQ(color);
    const key = `${routeShortName}_${color}_${textColor}`;
    if (iconCache.has(key)) return iconCache.get(key);

    const icon = L.divIcon({
        className: 'custom-bus-marker-container',
        html: `
            <div class="balloon-bus-marker">
                <div class="bus-mini-pill" style="background-color: ${color}; color: ${textColor};">
                    <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" style="margin-right: 4px;">
                        <path d="M4 16c0 .88.39 1.67 1 2.22V20c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-1h8v1c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-1.78c.61-.55 1-1.34 1-2.22V6c0-3.5-3.58-4-8-4s-8 .5-8 4v10zm3.5 1c-.83 0-1.5-.67-1.5-1.5S6.67 14 7.5 14s1.5.67 1.5 1.5S8.33 17 7.5 17zm9 0c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zm1.5-6H6V6h12v5z"/>
                    </svg>
                    <span style="font-weight: 900; font-size: 0.85rem;">${routeShortName || '?'}</span>
                </div>
            </div>
        `,
        iconSize: [60, 30],
        iconAnchor: [30, 15],
        popupAnchor: [0, -15]
    });

    iconCache.set(key, icon);
    return icon;
};

const BusMarker = memo(({ id, lat, lon, shortName, color, headsign, agency, onVehicleClick, t, rawVehicle }) => {
    const vColor = color ? (color.startsWith('#') ? color : '#' + color) : '#44bd32';
    const vTextColor = getContrastYIQ(vColor);

    return (
        <Marker
            position={[lat, lon]}
            icon={createBusIcon(shortName, vColor)}
            eventHandlers={{ click: () => onVehicleClick?.(rawVehicle) }}
        >
            <Popup className="bus-popup" minWidth={200}>
                <div style={{ textAlign: 'center', minWidth: '180px', padding: '5px' }}>
                    <div style={{ backgroundColor: vColor, color: vTextColor, padding: '10px 18px', borderRadius: '25px', display: 'inline-block', fontSize: '1.3rem', fontWeight: '900', marginBottom: '12px' }}>{shortName}</div>
                    <div style={{ fontSize: '1.2rem', fontWeight: '900', color: '#fff' }}>{headsign}</div>
                    <div style={{ textAlign: 'left', fontSize: '0.85rem', marginTop: '14px', borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: '10px' }}>
                        <div><strong>ID:</strong> {id}</div>
                        <div><strong>Operator:</strong> {agency}</div>
                    </div>
                </div>
            </Popup>
        </Marker>
    );
});

const MapEvents = memo(({ map, setMapZoom, updateVisibleElements, shapes, onSelectRoute, selectedPlan, selectedStopId, setSelectedStopId, stops, setIsOpen }) => {
    useMapEvents({
        moveend: () => {
            setMapZoom(map.getZoom());
            updateVisibleElements();
        },
        zoomend: () => {
            setMapZoom(map.getZoom());
            updateVisibleElements();
        },
        popupclose: () => {
            if (selectedStopId) setSelectedStopId(null);
        },
        click: () => {
            if (typeof window !== 'undefined' && window.innerWidth < 768 && setIsOpen) setIsOpen(false);
        }
    });

    useEffect(() => {
        if (!map) return;
        if (selectedStopId) {
            const stop = stops.find(s => s.stop_id === selectedStopId);
            if (stop) map.flyTo([stop.lat, stop.lon], 17, { animate: true, duration: 1.5 });
        } else if (selectedPlan) {
            const points = [[selectedPlan.from.lat, selectedPlan.from.lon], [selectedPlan.to.lat, selectedPlan.to.lon]];
            if (selectedPlan.hub) points.push([selectedPlan.hub.lat, selectedPlan.hub.lon]);
            map.fitBounds(points, { padding: [100, 100], animate: true, maxZoom: 16 });
        } else if (shapes?.length > 0) {
            map.fitBounds(shapes.flat(), { padding: [70, 70], animate: true, maxZoom: 15 });
        }
    }, [shapes, selectedPlan, selectedStopId, map, stops]);

    return null;
});

export default function BusMap({
    stops, shapes, routes, vehicles, selectedPlan, selectedStopId, setSelectedStopId, onSelectRoute, routeColor, onVehicleClick,
    showStops, setShowStops, isSatellite, setIsSatellite, setIsOpen, favorites, onToggleFavorite
}) {
    const mapRef = useRef(null);
    const { t } = useLanguage();
    const [visibleStops, setVisibleStops] = useState([]);
    const [mapZoom, setMapZoom] = useState(10);
    const [userLoc, setUserLoc] = useState(null);

    const updateVisibleStops = useCallback(() => {
        if (!mapRef.current) return;
        const m = mapRef.current;
        if (showStops && (m.getZoom() >= 15 || selectedStopId) && Array.isArray(stops)) {
            const bounds = m.getBounds().pad(0.1);
            setVisibleStops(stops.filter(s => s && s.lat !== undefined && bounds.contains([s.lat, s.lon])));
        } else {
            setVisibleStops([]);
        }
    }, [showStops, stops, selectedStopId]);

    useEffect(() => { updateVisibleStops(); }, [showStops, stops, updateVisibleStops]);

    const vehicleMarkers = useMemo(() => vehicles?.map((v, i) => (
        <BusMarker
            key={`bus-${v.id || v.vehicle_id || i}`}
            id={v.id || v.vehicle_id}
            lat={v.lt || v.lat}
            lon={v.ln || v.lon}
            shortName={v.sn || v.route_short_name}
            color={v.c}
            headsign={v.h}
            agency={v.ag}
            onVehicleClick={onVehicleClick}
            rawVehicle={v}
        />
    )) || [], [vehicles, onVehicleClick]);

    const routePolyline = useMemo(() => shapes?.length > 0 && (
        <Polyline positions={shapes} pathOptions={{ color: routeColor ? (routeColor.startsWith('#') ? routeColor : '#' + routeColor) : '#0070f3', weight: 6, opacity: 0.9 }} />
    ), [shapes, routeColor]);

    return (
        <div style={{ position: 'relative', height: '100%', width: '100%' }}>
            {/* Desktop Map Controls */}
            <div className="map-controls-container" style={{ position: 'absolute', top: '100px', right: '25px', zIndex: 1000, display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <button onClick={() => setIsSatellite(!isSatellite)} className="stops-toggle-btn" title={isSatellite ? t?.streetView || 'Street View' : t?.satelliteView || 'Satellite View'}>
                    <span>{isSatellite ? '🏙️' : '🛰️'}</span>
                </button>
                <button onClick={() => setShowStops(!showStops)} className={`stops-toggle-btn ${showStops ? 'active' : ''}`} title={showStops ? t?.hideStops || 'Hide Stops' : t?.showStops || 'Show Stops'}>
                    <span>{showStops ? '✕' : '🚏'}</span>
                </button>
                <button id="my-location-btn" className="stops-toggle-btn" title={t?.myLocation || 'My Location'}>
                    <span>🎯</span>
                </button>
                <button onClick={() => { if (confirm("Reboot site and refresh all data?")) window.location.reload(true); }} className="stops-toggle-btn" title="Reboot">
                    <span>🔄</span>
                </button>
            </div>

            <MapContainer
                center={[35.1264, 33.4299]}
                zoom={9}
                minZoom={8}
                maxBounds={[[32.5, 30.0], [36.5, 37.0]]}
                style={{ height: '100%', width: '100%', background: '#000' }}
                zoomControl={false}
                ref={mapRef}
                preferCanvas={true}
            >
                <ZoomControl position="bottomright" />
                <MapEvents
                    map={mapRef.current}
                    setMapZoom={setMapZoom}
                    updateVisibleElements={updateVisibleStops}
                    shapes={shapes}
                    onSelectRoute={onSelectRoute}
                    selectedPlan={selectedPlan}
                    selectedStopId={selectedStopId}
                    setSelectedStopId={setSelectedStopId}
                    setIsOpen={setIsOpen}
                    stops={stops}
                />

                <TileLayer url={isSatellite ? "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}" : "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"} />
                {routePolyline}

                {showStops && (mapZoom >= 15 || selectedStopId) && visibleStops.map((stop) => (
                    <Marker key={`stop-${stop.stop_id}`} position={[stop.lat, stop.lon]} icon={stopIcon}>
                        <Popup minWidth={300}>
                            <TimetablePopup stop={stop} routes={routes || []} onSelectRoute={onSelectRoute} favorites={favorites} onToggleFavorite={onToggleFavorite} />
                        </Popup>
                    </Marker>
                ))}

                {vehicleMarkers}

                {selectedPlan && (
                    <>
                        <Marker position={[selectedPlan.from.lat, selectedPlan.from.lon]} icon={planStartIcon} />
                        {selectedPlan.type === 'transfer' && <Marker position={[selectedPlan.hub.lat, selectedPlan.hub.lon]} icon={planHubIcon} />}
                        <Marker position={[selectedPlan.to.lat, selectedPlan.to.lon]} icon={planEndIcon} />
                    </>
                )}
            </MapContainer>
        </div>
    );
}
