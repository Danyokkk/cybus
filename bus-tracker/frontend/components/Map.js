'use client';

import { MapContainer, TileLayer, Marker, Popup, Polyline, CircleMarker } from 'react-leaflet';
import MarkerClusterGroup from 'react-leaflet-cluster';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { useEffect, useState } from 'react';
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
    iconSize: [32, 32], // Adjust size as needed
    iconAnchor: [16, 16],
    popupAnchor: [0, -16],
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

    if (loading) return <div style={{ minWidth: '320px', padding: '20px', textAlign: 'center', fontFamily: 'Unbounded, sans-serif' }}>Loading timetable...</div>;

    return (
        <div style={{ minWidth: '320px', maxWidth: '350px', fontFamily: 'Unbounded, sans-serif' }}>
            <h3 style={{ margin: '0 0 5px 0', fontSize: '1rem', whiteSpace: 'normal', wordWrap: 'break-word', lineHeight: '1.2' }}>{stop.name}</h3>
            <div style={{ fontSize: '0.8rem', color: '#666', marginBottom: '10px' }}>Stop ID: {stop.stop_id}</div>

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

            <table style={{ width: '100%', fontSize: '0.85rem', borderCollapse: 'collapse' }}>
                <thead>
                    <tr style={{ borderBottom: '1px solid #ddd', textAlign: 'left' }}>
                        <th style={{ padding: '6px 4px' }}>⏳ Time</th>
                        <th style={{ padding: '6px 4px' }}>🚌 Route</th>
                        <th style={{ padding: '6px 4px' }}>📍 Dest.</th>
                        <th style={{ padding: '6px 4px' }}>Status</th>
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
                                <tr key={i} style={{ borderBottom: '1px solid #eee' }}>
                                    <td style={{ padding: '8px 4px', fontWeight: 'bold' }}>{timeDisplay}</td>
                                    <td style={{ padding: '8px 4px' }}>
                                        <span
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                if (routeInfo) onSelectRoute(routeInfo);
                                            }}
                                            style={{
                                                background: '#eee',
                                                padding: '2px 6px',
                                                borderRadius: '4px',
                                                cursor: routeInfo ? 'pointer' : 'default',
                                                textDecoration: routeInfo ? 'underline' : 'none',
                                                fontSize: '0.8rem'
                                            }}
                                        >
                                            {arr.route_short_name}
                                        </span>
                                    </td>
                                    <td style={{ padding: '8px 4px' }}>{arr.trip_headsign}</td>
                                    <td style={{ padding: '8px 4px', color: arr.is_realtime ? 'green' : 'gray', fontWeight: arr.is_realtime ? 'bold' : 'normal' }}>
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

// Custom Bus Icon Generator
const createBusIcon = (routeShortName) => {
    return L.divIcon({
        className: 'custom-bus-marker',
        html: `
            <div class="bus-marker-container">
                <img src="/images/bus_blue.png" class="bus-icon-img" alt="Bus" />
                <div class="bus-badge">${routeShortName || '?'}</div>
            </div>
        `,
        iconSize: [32, 32],
        iconAnchor: [16, 16],
        popupAnchor: [0, -16]
    });
};

export default function Map({ stops, shapes, routes, onSelectRoute, routeColor, onVehicleClick, vehicles }) {
    const [showStops, setShowStops] = useState(false); // Default hidden
    const { t } = useLanguage();

    // Vehicle polling removed - now handled by page.js props

    const center = [34.68, 33.04]; // Limassol center

    return (
        <div style={{ position: 'relative', height: '100%', width: '100%' }}>

            {/* Show Stops Toggle Button */}
            <button
                onClick={() => setShowStops(!showStops)}
                className="stops-toggle-btn"
                style={{
                    position: 'absolute',
                    top: '20px',
                    right: '20px', // Right side so it doesn't conflict with sidebar
                    zIndex: 1000,
                    padding: '10px 20px',
                    borderRadius: '30px',
                    border: 'none',
                    background: showStops ? '#0070f3' : 'white',
                    color: showStops ? 'white' : '#333',
                    boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                    cursor: 'pointer',
                    fontFamily: 'Unbounded, sans-serif',
                    fontWeight: 'bold',
                    fontSize: '0.9rem',
                    transition: 'all 0.3s ease',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px'
                }}
            >
                <span style={{ fontSize: '1.2rem' }}>🚏</span>
                {showStops ? 'Hide Stops' : 'Show Stops'}
            </button>

            <MapContainer center={center} zoom={12} style={{ height: "100%", width: "100%" }}>
                <TileLayer
                    attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                />

                {/* Shapes */}
                {shapes && shapes.map((shape, index) => (
                    <Polyline
                        key={index}
                        positions={shape}
                        pathOptions={{ color: routeColor ? `#${routeColor}` : '#0070f3', weight: 4, opacity: 0.7 }}
                    />
                ))}

                {/* Stops with Relaxed Clustering - CONDITIONALLY RENDERED */}
                {showStops && (
                    <MarkerClusterGroup
                        chunkedLoading
                        disableClusteringAtZoom={14}
                        maxClusterRadius={30}
                        spiderfyOnMaxZoom={true}
                    >
                        {stops.map((stop) => (
                            <Marker key={stop.stop_id} position={[stop.lat, stop.lon]} icon={customIcon}>
                                <Popup>
                                    <TimetablePopup stop={stop} routes={routes || []} onSelectRoute={onSelectRoute} />
                                </Popup>
                            </Marker>
                        ))}
                    </MarkerClusterGroup>
                )}

                {/* Vehicles */}
                {vehicles.map((v, i) => {
                    // Try to find the correct color from the routes list (static data)
                    const routeInfo = routes.find(r =>
                        (r.short_name && v.route_short_name && r.short_name.trim() === v.route_short_name.trim()) ||
                        (r.route_short_name && v.route_short_name && r.route_short_name.trim() === v.route_short_name.trim())
                    );
                    const vColor = routeInfo ? `#${routeInfo.color || routeInfo.route_color}` : (v.color ? `#${v.color}` : '#0070f3');
                    const vTextColor = routeInfo ? `#${routeInfo.text_color || routeInfo.route_text_color}` : (v.text_color ? `#${v.text_color}` : 'white');

                    return (
                        <Marker
                            key={v.vehicle_id || i}
                            position={[v.lat, v.lon]}
                            icon={createBusIcon(v.route_short_name)}
                            eventHandlers={{
                                click: () => {
                                    if (onVehicleClick) onVehicleClick(v);
                                }
                            }}
                        >
                            <Popup className="bus-popup">
                                <div style={{ textAlign: 'center', minWidth: '180px' }}>
                                    <div style={{
                                        backgroundColor: vColor,
                                        color: vTextColor,
                                        padding: '8px 15px',
                                        borderRadius: '20px',
                                        display: 'inline-block',
                                        fontSize: '1.2rem',
                                        fontWeight: 'bold',
                                        marginBottom: '10px',
                                        boxShadow: '0 2px 5px rgba(0,0,0,0.2)'
                                    }}>
                                        {v.route_short_name}
                                    </div>
                                    <div style={{ fontSize: '1rem', fontWeight: 'bold', marginBottom: '5px', color: '#333' }}>
                                        {v.trip_headsign}
                                    </div>
                                    <div style={{ fontSize: '0.85rem', color: '#666', marginBottom: '10px' }}>
                                        {v.route_long_name}
                                    </div>
                                    <div style={{ textAlign: 'left', fontSize: '0.9rem', marginTop: '10px', borderTop: '1px solid #eee', paddingTop: '10px' }}>
                                        <div style={{ marginBottom: '4px' }}><strong>Vehicle:</strong> {v.vehicle_id}</div>
                                        <div style={{ marginBottom: '4px' }}><strong>{t.speed}:</strong> {(v.speed * 3.6).toFixed(1)} km/h</div>
                                        <div><strong>Fare:</strong> €2.00</div>
                                    </div>
                                </div>
                            </Popup>
                        </Marker>
                    );
                })}

            </MapContainer>
        </div>
    );
}
