'use client';

import { useState, useEffect } from 'react';
import { useLanguage } from '../context/LanguageContext';

export default function Sidebar({ routes, stops, onSelectRoute, onSelectPlan, selectedRouteId, isOpen, setIsOpen, activeTab, setActiveTab, favorites, onToggleFavorite }) {
    const [searchTerm, setSearchTerm] = useState('');
    const { language, setLanguage, t } = useLanguage();
    const [isMobile, setIsMobile] = useState(false);
    const [selectedAgency, setSelectedAgency] = useState('All');

    useEffect(() => {
        const check = () => setIsMobile(window.innerWidth < 768);
        check();
        window.addEventListener('resize', check);
        return () => window.removeEventListener('resize', check);
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

    const handleUseMyLocation = () => {
        if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition((pos) => {
                setOriginCoords({ lat: pos.coords.latitude, lon: pos.coords.longitude });
                setOriginQuery(t.myLocation || "Current Location");
            });
        }
    };

    const selectOrigin = (s) => {
        setOriginCoords({ lat: parseFloat(s.lat), lon: parseFloat(s.lon) });
        setOriginQuery(s.display_name.split(',')[0]);
        setOriginSuggestions([]);
    };

    const selectDest = (s) => {
        setDestCoords({ lat: parseFloat(s.lat), lon: parseFloat(s.lon) });
        setDestQuery(s.display_name.split(',')[0]);
        setDestSuggestions([]);
    };

    const handlePlanRoute = async () => {
        if (!originCoords || !destCoords) return;
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

    return (
        <>
            <div className={`sidebar ${isOpen ? 'open' : 'closed'} ${isMobile ? 'is-mobile' : ''}`}>
                {!isMobile && (
                    <button
                        className="sidebar-toggle-tab"
                        onClick={() => setIsOpen(!isOpen)}
                        aria-label={isOpen ? "Close Sidebar" : "Open Sidebar"}
                    >
                        {isOpen
                            ? <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M15 18l-6-6 6-6" /></svg>
                            : <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 18l6-6-6-6" /></svg>
                        }
                    </button>
                )}

                <div className="sidebar-header">
                    <div style={{ display: 'flex', alignItems: 'center', gap: isMobile ? '8px' : '12px', marginBottom: '15px' }}>
                        <h2 style={{ fontSize: isMobile ? '1.1rem' : '1.4rem', margin: 0, fontWeight: 900, color: 'var(--nebula-accent)' }}>CyBus</h2>
                        <div className="tab-switcher">
                            <button className={`tab-btn ${activeTab === 'routes' ? 'active' : ''}`} onClick={() => setActiveTab('routes')}>Routes</button>
                            <button className={`tab-btn ${activeTab === 'planner' ? 'active' : ''}`} onClick={() => setActiveTab('planner')}>Plan</button>
                            <button className={`tab-btn ${activeTab === 'favorites' ? 'active' : ''}`} onClick={() => setActiveTab('favorites')}>⭐</button>
                        </div>
                    </div>

                    {activeTab === 'routes' ? (
                        <div className="search-container">
                            <input
                                type="text"
                                placeholder={t.searchPlaceholder || 'Search...'}
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="search-input"
                            />
                            <div className="agency-chips" style={{ display: 'flex', gap: '8px', overflowX: 'auto', marginTop: '10px', scrollbarWidth: 'none', paddingBottom: '5px' }}>
                                {['All', ...new Set(routes.map(r => r.agency_name).filter(Boolean))].map(agency => (
                                    <button 
                                        key={agency}
                                        onClick={() => setSelectedAgency(agency)}
                                        style={{
                                            whiteSpace: 'nowrap',
                                            padding: '4px 12px',
                                            borderRadius: '20px',
                                            fontSize: '0.65rem',
                                            fontWeight: 900,
                                            border: '1px solid var(--glass-border)',
                                            background: selectedAgency === agency ? 'var(--nebula-accent)' : 'rgba(255,255,255,0.05)',
                                            color: selectedAgency === agency ? '#000' : '#fff',
                                            cursor: 'pointer',
                                            transition: 'all 0.2s'
                                        }}
                                    >
                                        {agency}
                                    </button>
                                ))}
                            </div>
                        </div>
                    ) : activeTab === 'favorites' ? (
                        <div className="favorites-header" style={{ padding: '0 5px', color: '#fff', fontSize: '0.8rem', fontWeight: 900 }}>
                            SAVED STOPS
                        </div>
                    ) : (
                        <div className="planner-form">
                            <div className="input-group">
                                <input
                                    className={`planner-input ${isSearchingOrigin ? 'loading' : ''}`}
                                    style={{ paddingLeft: '45px' }}
                                    placeholder={t.fromPlaceholder || "From..."}
                                    value={originQuery}
                                    onChange={e => { setOriginQuery(e.target.value); setOriginCoords(null); }}
                                />
                                <button className="geo-btn" onClick={handleUseMyLocation} title={t.myLocation || "Use My Location"} type="button">
                                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path><circle cx="12" cy="10" r="3"></circle></svg>
                                </button>
                                {originSuggestions.length > 0 && (
                                    <ul className="suggestions-list">
                                        {originSuggestions.map((s, i) => (
                                            <li key={i} onClick={() => selectOrigin(s)} className="suggestion-item">
                                                <span className="suggestion-icon">{s.type === 'bus_stop' ? '🚏' : '📍'}</span>
                                                <div className="suggestion-text">
                                                    <div className="main-name">{s.display_name.split(',')[0]}</div>
                                                    <div className="sub-name">{s.display_name.split(',').slice(1, 3).join(', ')}</div>
                                                </div>
                                            </li>
                                        ))}
                                    </ul>
                                )}
                            </div>
                            <div className="input-group" style={{ marginTop: '10px' }}>
                                <input
                                    className={`planner-input ${isSearchingDest ? 'loading' : ''}`}
                                    placeholder={t.toPlaceholder || "To..."}
                                    value={destQuery}
                                    onChange={e => { setDestQuery(e.target.value); setDestCoords(null); }}
                                />
                                {destSuggestions.length > 0 && (
                                    <ul className="suggestions-list">
                                        {destSuggestions.map((s, i) => (
                                            <li key={i} onClick={() => selectDest(s)} className="suggestion-item">
                                                <span className="suggestion-icon">{s.type === 'bus_stop' ? '🚏' : '📍'}</span>
                                                <div className="suggestion-text">
                                                    <div className="main-name">{s.display_name.split(',')[0]}</div>
                                                    <div className="sub-name">{s.display_name.split(',').slice(1, 3).join(', ')}</div>
                                                </div>
                                            </li>
                                        ))}
                                    </ul>
                                )}
                            </div>
                            <button className="plan-submit-btn" onClick={handlePlanRoute} disabled={!originCoords || !destCoords} style={{ marginTop: '15px' }}>
                                {isPlanning ? 'Analyzing...' : 'Find Route'}
                            </button>
                        </div>
                    )}
                </div>

                <div className="route-list">
                    {activeTab === 'routes' && (
                        routes && routes.filter(r => {
                            const matchesSearch = (r.short_name || '').toLowerCase().includes(searchTerm.toLowerCase()) || 
                                                 (r.long_name || '').toLowerCase().includes(searchTerm.toLowerCase());
                            const matchesAgency = selectedAgency === 'All' || r.agency_name === selectedAgency;
                            return matchesSearch && matchesAgency;
                        }).map((route) => {
                            const badgeColor = route.color ? (route.color.startsWith('#') ? route.color : '#' + route.color) : 'var(--nebula-accent)';
                            return (
                                <div
                                    key={route.route_id}
                                    className={`route-item ${selectedRouteId === route.route_id ? 'active' : ''}`}
                                    onClick={() => onSelectRoute(route)}
                                >
                                    <div className="route-badge" style={{ backgroundColor: badgeColor, color: `#${route.text_color || 'FFFFFF'}` }}>
                                        {route.short_name}
                                    </div>
                                    <div className="route-name" style={{ fontSize: '0.75rem', fontWeight: 900, lineHeight: 1.2, textAlign: 'left', flex: 1 }}>
                                        {route.long_name}
                                    </div>
                                </div>
                            );
                        })
                    )}

                    {activeTab === 'favorites' && (
                        <div className="favorites-list">
                            {favorites && favorites.length > 0 ? (
                                favorites.map(fId => {
                                    const stop = stops.find(s => s.stop_id === fId);
                                    if (!stop) return null;
                                    return (
                                        <div key={fId} className="route-item" style={{ justifyContent: 'space-between' }}>
                                            <div 
                                                className="stop-info" 
                                                style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: 1, cursor: 'pointer' }}
                                                onClick={() => onSelectPlan({ from: stop, to: stop, type: 'direct' })}
                                            >
                                                <div className="route-badge" style={{ backgroundColor: 'rgba(255,255,255,0.05)', minWidth: '40px', padding: '8px' }}>🚏</div>
                                                <div className="route-name" style={{ fontSize: '0.75rem' }}>{stop.name}</div>
                                            </div>
                                            <button 
                                                onClick={(e) => { e.stopPropagation(); onToggleFavorite(fId); }}
                                                style={{ background: 'none', border: 'none', color: 'var(--nebula-accent)', cursor: 'pointer', fontSize: '1.1rem' }}
                                            >
                                                ⭐
                                            </button>
                                        </div>
                                    );
                                })
                            ) : (
                                <div style={{ textAlign: 'center', padding: '40px 20px', color: '#666', fontSize: '0.8rem' }}>
                                    No favorites yet.<br/>Star a stop on the map to add.
                                </div>
                            )}
                        </div>
                    )}

                    {activeTab === 'planner' && (
                        <div className="planner-results">
                            {planResults.map((plan, i) => (
                                <div key={i} className="plan-card" onClick={() => onSelectPlan(plan)}>
                                    <div className="plan-header" style={{ display: 'flex', alignItems: 'center', gap: '5px', marginBottom: '8px' }}>
                                        {plan.type === 'transfer' ? (
                                            <>
                                                <div className="route-badge" style={{ backgroundColor: `#${plan.route1.color || '000'}`, transform: 'scale(0.8)' }}>{plan.route1.short_name}</div>
                                                <span>➜</span>
                                                <div className="route-badge" style={{ backgroundColor: `#${plan.route2.color || '000'}`, transform: 'scale(0.8)' }}>{plan.route2.short_name}</div>
                                            </>
                                        ) : (
                                            <div className="route-badge" style={{ backgroundColor: `#${plan.route.color || '000'}`, transform: 'scale(0.8)' }}>{plan.route.short_name}</div>
                                        )}
                                    </div>
                                    <div style={{ fontSize: '0.7rem', opacity: 0.8 }}>Walk: {plan.total_walk} km</div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                <div className="sidebar-footer">
                    <div className="daan1k-credit">made by @daan1k</div>
                </div>
            </div>
        </>
    );
}
