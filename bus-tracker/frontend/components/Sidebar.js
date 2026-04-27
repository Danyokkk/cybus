'use client';

import { useState, useEffect, useMemo } from 'react';
import { useLanguage } from '../context/LanguageContext';

export default function Sidebar({
    routes, stops, onSelectRoute, onSelectPlan, onSelectStop, selectedRouteId,
    isOpen, setIsOpen, activeTab, setActiveTab,
    favorites, onToggleFavorite
}) {
    const { t, language, setLanguage } = useLanguage();
    const [searchTerm, setSearchTerm] = useState('');
    const [isMobile, setIsMobile] = useState(false);

    useEffect(() => {
        const handleResize = () => setIsMobile(window.innerWidth < 768);
        handleResize();
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    // Planner State
    const [originQuery, setOriginQuery] = useState('');
    const [originCoords, setOriginCoords] = useState(null);
    const [originSuggestions, setOriginSuggestions] = useState([]);

    const [destQuery, setDestQuery] = useState('');
    const [destCoords, setDestCoords] = useState(null);
    const [destSuggestions, setDestSuggestions] = useState([]);

    const [isSearchingOrigin, setIsSearchingOrigin] = useState(false);
    const [isSearchingDest, setIsSearchingDest] = useState(false);

    const [planResults, setPlanResults] = useState([]);
    const [isPlanning, setIsPlanning] = useState(false);

    // --- Autocomplete Logic ---
    useEffect(() => {
        const timer = setTimeout(async () => {
            if (originQuery && originQuery.length > 2 && !originCoords) {
                setIsSearchingOrigin(true);
                const localStops = (stops || [])
                    .filter(s => s.name.toLowerCase().includes(originQuery.toLowerCase()))
                    .slice(0, 3)
                    .map(s => ({
                        display_name: `${s.name}, Bus Stop`,
                        lat: s.lat,
                        lon: s.lon,
                        type: 'bus_stop',
                        isLocal: true
                    }));

                try {
                    const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(originQuery)}&countrycodes=cy&limit=5&addressdetails=1&accept-language=${language}`);
                    const data = await res.json();
                    setOriginSuggestions([...localStops, ...data]);
                } catch (err) {
                    console.error("Autocomplete fetch error", err);
                    setOriginSuggestions(localStops);
                } finally {
                    setIsSearchingOrigin(false);
                }
            } else {
                setOriginSuggestions([]);
            }
        }, 800);
        return () => clearTimeout(timer);
    }, [originQuery, originCoords, language, stops]);

    useEffect(() => {
        const timer = setTimeout(async () => {
            if (destQuery && destQuery.length > 2 && !destCoords) {
                setIsSearchingDest(true);
                const localStops = (stops || [])
                    .filter(s => s.name.toLowerCase().includes(destQuery.toLowerCase()))
                    .slice(0, 3)
                    .map(s => ({
                        display_name: `${s.name}, Bus Stop`,
                        lat: s.lat,
                        lon: s.lon,
                        type: 'bus_stop',
                        isLocal: true
                    }));

                try {
                    const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(destQuery)}&countrycodes=cy&limit=5&addressdetails=1&accept-language=${language}`);
                    const data = await res.json();
                    setDestSuggestions([...localStops, ...data]);
                } catch (err) {
                    console.error("Autocomplete fetch error", err);
                    setDestSuggestions(localStops);
                } finally {
                    setIsSearchingDest(false);
                }
            } else {
                setDestSuggestions([]);
            }
        }, 800);
        return () => clearTimeout(timer);
    }, [destQuery, destCoords, language, stops]);

    const selectOrigin = (place) => {
        setOriginQuery(place.display_name);
        setOriginCoords({ lat: place.lat, lon: place.lon });
        setOriginSuggestions([]);
    };

    const selectDest = (place) => {
        setDestQuery(place.display_name);
        setDestCoords({ lat: place.lat, lon: place.lon });
        setDestSuggestions([]);
    };

    const handleUseMyLocation = () => {
        if (!navigator.geolocation) return alert("Geolocation not supported");

        setIsSearchingOrigin(true);
        navigator.geolocation.getCurrentPosition(async (pos) => {
            const { latitude, longitude } = pos.coords;
            setOriginCoords({ lat: latitude, lon: longitude });

            try {
                const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}&accept-language=${language}`);
                const data = await res.json();
                setOriginQuery(data.display_name.split(',').slice(0, 2).join(','));
            } catch (e) {
                setOriginQuery(`${latitude.toFixed(4)}, ${longitude.toFixed(4)}`);
            } finally {
                setIsSearchingOrigin(false);
            }
        }, (err) => {
            setIsSearchingOrigin(false);
            alert("Location access denied");
        });
    };

    const filteredRoutes = useMemo(() => {
        return routes.filter(r =>
            r.short_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
            r.long_name?.toLowerCase().includes(searchTerm.toLowerCase())
        );
    }, [routes, searchTerm]);

    const handlePlanRoute = async () => {
        if (!originCoords || !destCoords) {
            alert("Please select valid locations from the suggestions list.");
            return;
        }
        setIsPlanning(true);
        try {
            const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'https://cybus.onrender.com';
            const planRes = await fetch(`${apiUrl}/api/plan-route?lat1=${originCoords.lat}&lon1=${originCoords.lon}&lat2=${destCoords.lat}&lon2=${destCoords.lon}`);
            const plans = await planRes.json();
            setPlanResults(plans);
        } catch (e) {
            console.error(e);
        }
        setIsPlanning(false);
    };

    // Calculate indicator position for sliding tabs
    const getIndicatorStyle = () => {
        const tabs = ['routes', 'planner', 'favorites'];
        const index = tabs.indexOf(activeTab);
        return {
            left: `${(index * 100) / 3}%`,
            width: '33.33%'
        };
    };

    return (
        <div className={`sidebar ${isOpen ? 'open' : 'closed'} ${isMobile ? 'is-mobile' : ''}`}>
            <div className="sidebar-header">
                <div className="header-top-row">
                    <div className="sidebar-logo-shell">CyBus</div>
                    <div className="tab-bubble-container">
                        <div className="tab-bubble-indicator" style={getIndicatorStyle()}></div>
                        <button className={`tab-bubble-btn ${activeTab === 'routes' ? 'active' : ''}`} onClick={() => setActiveTab('routes')}>Routes</button>
                        <button className={`tab-bubble-btn ${activeTab === 'planner' ? 'active' : ''}`} onClick={() => setActiveTab('planner')}>Plan</button>
                        <button className={`tab-bubble-btn ${activeTab === 'favorites' ? 'active' : ''}`} onClick={() => setActiveTab('favorites')}>⭐</button>
                    </div>
                </div>

                {activeTab === 'routes' ? (
                    <div className="search-container">
                        <input
                            type="text"
                            placeholder={t?.searchPlaceholder || 'Search...'}
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="search-input"
                        />
                    </div>
                ) : null}
            </div>

            <div className="route-list">
                {activeTab === 'routes' && (
                    <>
                        <div
                            className={`route-item ${!selectedRouteId ? 'active' : ''}`}
                            onClick={() => onSelectRoute(null)}
                            style={{ justifyContent: 'center', background: !selectedRouteId ? 'rgba(255, 0, 51, 0.15)' : 'rgba(255, 255, 255, 0.05)', border: !selectedRouteId ? '1px solid var(--nebula-accent)' : '1px solid rgba(255, 255, 255, 0.1)' }}
                        >
                            <div className="route-info" style={{ textAlign: 'center' }}>
                                <strong style={{ fontSize: '0.85rem' }}>{t?.allRoutes || 'Show All Routes'}</strong>
                            </div>
                        </div>

                        {filteredRoutes.map((route) => (
                            <div
                                key={route.route_id}
                                className={`route-item ${selectedRouteId === route.route_id ? 'active' : ''}`}
                                onClick={() => onSelectRoute(route)}
                            >
                                <div
                                    className="route-badge"
                                    style={{
                                        backgroundColor: `#${route.color || '0070f3'}`,
                                        color: `#${route.text_color || 'ffffff'}`
                                    }}
                                >
                                    {route.short_name}
                                </div>
                                <div className="route-info">
                                    <div className="route-name">{route.long_name}</div>
                                    <div className="route-agency">{route.agency_id}</div>
                                </div>
                            </div>
                        ))}
                    </>
                )}

                {activeTab === 'planner' && (
                    <div className="planner-container" style={{ padding: '0 5px' }}>
                        <div className="input-group" style={{ position: 'relative', marginBottom: '15px' }}>
                            <input
                                className="search-input"
                                style={{ paddingLeft: '45px', marginTop: '0', borderColor: isSearchingOrigin ? 'var(--nebula-accent)' : 'var(--glass-border)' }}
                                placeholder={t?.fromPlaceholder || "From..."}
                                value={originQuery}
                                onChange={e => { setOriginQuery(e.target.value); setOriginCoords(null); }}
                            />
                            <button
                                onClick={handleUseMyLocation}
                                title={t?.myLocation || "Use My Location"}
                                type="button"
                                style={{
                                    position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)',
                                    background: 'transparent', border: 'none', color: 'var(--nebula-accent)', cursor: 'pointer', zIndex: 5
                                }}
                            >
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path><circle cx="12" cy="10" r="3"></circle></svg>
                            </button>
                            {isSearchingOrigin && <div style={{ position: 'absolute', right: '12px', top: '15px', width: '16px', height: '16px', border: '2px solid rgba(255,255,255,0.1)', borderTopColor: 'var(--nebula-accent)', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />}
                            
                            {originSuggestions.length > 0 && (
                                <ul style={{ position: 'absolute', top: '100%', left: 0, width: '100%', background: 'rgba(0, 5, 0, 0.98)', backdropFilter: 'blur(20px)', border: '1px solid var(--glass-border)', borderTop: 'none', borderRadius: '0 0 20px 20px', listStyle: 'none', maxHeight: '250px', overflowY: 'auto', zIndex: 3000, boxShadow: '0 10px 40px rgba(0,0,0,0.8)', padding: '5px 0', marginTop: '-5px' }}>
                                    {originSuggestions.map((s, i) => (
                                        <li key={i} onClick={() => selectOrigin(s)} style={{ padding: '12px 15px', display: 'flex', alignItems: 'center', gap: '12px', borderBottom: '1px solid rgba(255,255,255,0.03)', cursor: 'pointer' }}>
                                            <span style={{ fontSize: '1.1rem', minWidth: '24px' }}>
                                                {s.type === 'bus_stop' || s.class === 'highway' ? '🚏' : (s.type === 'city' ? '🏙️' : '📍')}
                                            </span>
                                            <div style={{ display: 'flex', flexDirection: 'column' }}>
                                                <div style={{ fontSize: '0.85rem', color: '#fff', fontWeight: '900' }}>{s.display_name.split(',')[0]}</div>
                                                <div style={{ fontSize: '0.65rem', color: '#888', fontWeight: '500' }}>{s.display_name.split(',').slice(1, 3).join(', ')}</div>
                                            </div>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </div>

                        <div className="input-group" style={{ position: 'relative', marginBottom: '15px' }}>
                            <input
                                className="search-input"
                                style={{ marginTop: '0', borderColor: isSearchingDest ? 'var(--nebula-accent)' : 'var(--glass-border)' }}
                                placeholder={t?.toPlaceholder || "To..."}
                                value={destQuery}
                                onChange={e => { setDestQuery(e.target.value); setDestCoords(null); }}
                            />
                            {isSearchingDest && <div style={{ position: 'absolute', right: '12px', top: '15px', width: '16px', height: '16px', border: '2px solid rgba(255,255,255,0.1)', borderTopColor: 'var(--nebula-accent)', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />}
                            
                            {destSuggestions.length > 0 && (
                                <ul style={{ position: 'absolute', top: '100%', left: 0, width: '100%', background: 'rgba(0, 5, 0, 0.98)', backdropFilter: 'blur(20px)', border: '1px solid var(--glass-border)', borderTop: 'none', borderRadius: '0 0 20px 20px', listStyle: 'none', maxHeight: '250px', overflowY: 'auto', zIndex: 3000, boxShadow: '0 10px 40px rgba(0,0,0,0.8)', padding: '5px 0', marginTop: '-5px' }}>
                                    {destSuggestions.map((s, i) => (
                                        <li key={i} onClick={() => selectDest(s)} style={{ padding: '12px 15px', display: 'flex', alignItems: 'center', gap: '12px', borderBottom: '1px solid rgba(255,255,255,0.03)', cursor: 'pointer' }}>
                                            <span style={{ fontSize: '1.1rem', minWidth: '24px' }}>
                                                {s.type === 'bus_stop' || s.class === 'highway' ? '🚏' : (s.type === 'city' ? '🏙️' : '📍')}
                                            </span>
                                            <div style={{ display: 'flex', flexDirection: 'column' }}>
                                                <div style={{ fontSize: '0.85rem', color: '#fff', fontWeight: '900' }}>{s.display_name.split(',')[0]}</div>
                                                <div style={{ fontSize: '0.65rem', color: '#888', fontWeight: '500' }}>{s.display_name.split(',').slice(1, 3).join(', ')}</div>
                                            </div>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </div>

                        <button
                            onClick={handlePlanRoute}
                            disabled={!originCoords || !destCoords || isPlanning}
                            style={{
                                width: '100%', background: 'var(--nebula-accent)', border: 'none', padding: '14px', borderRadius: '16px', color: '#fff', fontWeight: '900', cursor: (!originCoords || !destCoords) ? 'not-allowed' : 'pointer', opacity: (!originCoords || !destCoords) ? 0.5 : 1, transition: 'all 0.3s ease', boxShadow: '0 4px 15px rgba(255, 0, 51, 0.3)'
                            }}
                        >
                            {isPlanning ? (t?.analyzing || 'Analyzing...') : (t?.findRoute || 'Find Route')}
                        </button>

                        <div className="plan-results" style={{ marginTop: '20px' }}>
                            {planResults.length === 0 && !isPlanning && originCoords && destCoords && (
                                <div style={{ padding: '20px', textAlign: 'center', opacity: 0.5 }}>{t?.noRoutesFound || 'No routes found'}</div>
                            )}
                            {planResults.map((plan, idx) => (
                                <div key={idx} style={{ background: 'rgba(255, 255, 255, 0.02)', border: '1px solid rgba(255, 255, 255, 0.05)', padding: '15px', borderRadius: '16px', marginBottom: '10px', cursor: 'pointer' }} onClick={() => onSelectPlan(plan)}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px', borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: '10px' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                            {plan.type === 'transfer' ? (
                                                <>
                                                    <div className="route-badge" style={{ backgroundColor: `#${plan.route1.color || '000'}`, color: `#${plan.route1.text_color || 'fff'}`, transform: 'scale(0.8)' }}>{plan.route1.short_name}</div>
                                                    <span style={{ fontSize: '0.8rem', opacity: 0.5 }}>➜</span>
                                                    <div className="route-badge" style={{ backgroundColor: `#${plan.route2.color || '000'}`, color: `#${plan.route2.text_color || 'fff'}`, transform: 'scale(0.8)' }}>{plan.route2.short_name}</div>
                                                </>
                                            ) : (
                                                <div className="route-badge" style={{ backgroundColor: `#${plan.route.color || '000'}`, color: `#${plan.route.text_color || 'fff'}`, transform: 'scale(0.9)' }}>{plan.route.short_name}</div>
                                            )}
                                        </div>
                                        <span style={{ fontSize: '0.7rem', fontWeight: 'bold', opacity: 0.6 }}>{plan.type === 'transfer' ? '1 Transfer' : 'Direct'}</span>
                                    </div>
                                    <div style={{ fontSize: '0.75rem', color: '#aaa', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                        {plan.type === 'transfer' ? (
                                            <>
                                                <div>🚌 Ride <b style={{ color: 'var(--nebula-accent)' }}>{plan.route1.short_name}</b> to {plan.hub.stop_name}</div>
                                                <div>🔄 Transfer to <b style={{ color: 'var(--nebula-accent)' }}>{plan.route2.short_name}</b></div>
                                                <div>🚶 Walk {plan.total_walk}km total</div>
                                            </>
                                        ) : (
                                            <>
                                                <div>🚌 Ride <b style={{ color: 'var(--nebula-accent)' }}>{plan.route.short_name}</b></div>
                                                <div>🚶 Walk {plan.total_walk}km total</div>
                                            </>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {activeTab === 'favorites' && (
                    <div className="favorites-container">
                        <div className="favorites-header">Saved Stops</div>
                        {favorites.length === 0 ? (
                            <div style={{ padding: '20px', textAlign: 'center', opacity: 0.5 }}>No favorites yet</div>
                        ) : (
                            favorites.map(fId => {
                                const stop = stops.find(s => s.stop_id === fId);
                                if (!stop) return null;
                                return (
                                    <div key={fId} className="route-item" onClick={() => onSelectStop(fId)}>
                                        <div className="route-badge" style={{ backgroundColor: 'var(--nebula-accent)' }}>🚏</div>
                                        <div className="route-info">
                                            <div className="route-name">{stop.name}</div>
                                            <div className="route-agency">ID: {fId}</div>
                                        </div>
                                        <button 
                                            className="fav-btn active" 
                                            onClick={(e) => { e.stopPropagation(); onToggleFavorite(fId); }}
                                        >
                                            ⭐
                                        </button>
                                    </div>
                                );
                            })
                        )}
                    </div>
                )}
            </div>

            <div className="sidebar-footer">
                <div className="daan1k-credit">made by @daan1k</div>
            </div>
            
            <style jsx>{`
                @keyframes spin {
                    to { transform: rotate(360deg); }
                }
                .suggestion-item:hover {
                    background: rgba(255, 0, 51, 0.1) !important;
                }
            `}</style>
        </div>
    );
}
