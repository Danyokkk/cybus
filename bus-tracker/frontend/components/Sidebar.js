'use client';

import { useState, useEffect } from 'react';
import { useLanguage } from '../context/LanguageContext';

export default function Sidebar({ routes, stops, onSelectRoute, onSelectPlan, selectedRouteId, isOpen, setIsOpen, activeTab, setActiveTab }) {
    const [searchTerm, setSearchTerm] = useState('');
    const { language, setLanguage, t } = useLanguage();
    const [isMobile, setIsMobile] = useState(false);

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

                // 1. Local Stops Search
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

                    // Combine results
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

                // 1. Local Stops Search
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
                // Reverse geocoding to get a readable name
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

    const filteredRoutes = routes.filter(route =>
        (route.short_name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (route.long_name || '').toLowerCase().includes(searchTerm.toLowerCase())
    );

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
                        <div style={{ display: 'flex', alignItems: 'center', gap: isMobile ? '8px' : '12px' }}>
                            <h2 style={{ fontSize: isMobile ? '1.1rem' : '1.4rem', margin: 0, fontWeight: 900, color: 'var(--nebula-accent)' }}>CyBus</h2>
                            <div className="tab-switcher">
                                <button
                                    className={`tab-btn ${activeTab === 'routes' ? 'active' : ''}`}
                                    onClick={() => setActiveTab('routes')}
                                    style={{ padding: isMobile ? '4px 8px' : '4px 12px', fontSize: isMobile ? '0.7rem' : '0.75rem' }}
                                >
                                    Routes
                                </button>
                                <button
                                    className={`tab-btn ${activeTab === 'planner' ? 'active' : ''}`}
                                    onClick={() => setActiveTab('planner')}
                                    style={{ padding: isMobile ? '4px 8px' : '4px 12px', fontSize: isMobile ? '0.7rem' : '0.75rem' }}
                                >
                                    {t.plannerTab || 'Plan'}
                                </button>
                            </div>
                        </div>

                    {activeTab === 'routes' ? (
                        <input
                            type="text"
                            placeholder={t.searchPlaceholder || 'Search...'}
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="search-input"
                        />
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
                                <button
                                    className="geo-btn"
                                    onClick={handleUseMyLocation}
                                    title={t.myLocation || "Use My Location"}
                                    type="button"
                                >
                                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path><circle cx="12" cy="10" r="3"></circle></svg>
                                </button>
                                {isSearchingOrigin && <div className="input-spinner" />}
                                {originSuggestions.length > 0 && (
                                    <ul className="suggestions-list">
                                        {originSuggestions.map((s, i) => {
                                            const parts = s.display_name.split(',');
                                            const mainName = parts[0];
                                            const subName = parts.slice(1, 3).join(', ');
                                            const isStop = s.type === 'bus_stop' || s.class === 'highway';
                                            return (
                                                <li key={i} onClick={() => selectOrigin(s)} className="suggestion-item">
                                                    <span className="suggestion-icon">
                                                        {isStop ? '🚏' : (s.type === 'city' ? '🏙️' : '📍')}
                                                    </span>
                                                    <div className="suggestion-text">
                                                        <div className="main-name">{mainName}</div>
                                                        <div className="sub-name">{subName}</div>
                                                    </div>
                                                </li>
                                            );
                                        })}
                                    </ul>
                                )}
                            </div>

                            <div className="input-group">
                                <input
                                    className={`planner-input ${isSearchingDest ? 'loading' : ''}`}
                                    placeholder={t.toPlaceholder || "To..."}
                                    value={destQuery}
                                    onChange={e => { setDestQuery(e.target.value); setDestCoords(null); }}
                                />
                                {isSearchingDest && <div className="input-spinner" />}
                                {destSuggestions.length > 0 && (
                                    <ul className="suggestions-list">
                                        {destSuggestions.map((s, i) => {
                                            const parts = s.display_name.split(',');
                                            const mainName = parts[0];
                                            const subName = parts.slice(1, 3).join(', ');
                                            const isStop = s.type === 'bus_stop' || s.class === 'highway';
                                            return (
                                                <li key={i} onClick={() => selectDest(s)} className="suggestion-item">
                                                    <span className="suggestion-icon">
                                                        {isStop ? '🚏' : (s.type === 'city' ? '🏙️' : '📍')}
                                                    </span>
                                                    <div className="suggestion-text">
                                                        <div className="main-name">{mainName}</div>
                                                        <div className="sub-name">{subName}</div>
                                                    </div>
                                                </li>
                                            );
                                        })}
                                    </ul>
                                )}
                            </div>

                            <button className="plan-submit-btn" onClick={handlePlanRoute} disabled={!originCoords || !destCoords}>
                                {isPlanning ? (t.analyzing || 'Analyzing...') : (t.findRoute || 'Find Route')}
                            </button>
                        </div>
                    )}
                </div>

                <div className="route-list">
                    {activeTab === 'routes' ? (
                        <>
                            <button
                                className={`route-item ${!selectedRouteId ? 'active' : ''}`}
                                onClick={() => onSelectRoute(null)}
                            >
                                <div className="route-info">
                                    <strong style={{ fontSize: '0.85rem' }}>{t?.allRoutes}</strong>
                                </div>
                            </button>
                            {filteredRoutes.map(route => (
                                <button
                                    key={route.route_id}
                                    className={`route-item ${selectedRouteId === route.route_id ? 'active' : ''}`}
                                    onClick={() => onSelectRoute(route)}
                                >
                                    <div className="route-badge" style={{
                                        backgroundColor: `#${route.color || '0a0a2e'}`,
                                        color: `#${route.text_color || 'FFFFFF'}`
                                    }}>
                                        {route.short_name}
                                    </div>
                                    <div className="route-info" style={{ textAlign: 'left' }}>
                                        <span style={{ fontSize: '0.75rem', opacity: 0.8 }}>{route.long_name}</span>
                                    </div>
                                </button>
                            ))}
                        </>
                    ) : (
                        <div className="planner-results">
                            {planResults.length === 0 && !isPlanning && (
                                <div style={{ padding: '20px', textAlign: 'center', color: '#666', fontSize: '0.8rem' }}>
                                    {originCoords && destCoords ? (t.noRoutesFound || "No routes found nearby") : (t.plannerHint || "Select start and end points in Cyprus.")}
                                </div>
                            )}
                            {planResults.map((plan, i) => (
                                <div key={i} className="plan-card" onClick={() => onSelectPlan(plan)}>
                                    <div className="plan-header" style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                                        {plan.type === 'transfer' ? (
                                            <>
                                                <div className="route-badge" style={{ backgroundColor: `#${plan.route1.color || '000'}`, color: `#${plan.route1.text_color || 'fff'}`, transform: 'scale(0.7)' }}>
                                                    {plan.route1.short_name}
                                                </div>
                                                <span style={{ fontSize: '0.8rem' }}>➜</span>
                                                <div className="route-badge" style={{ backgroundColor: `#${plan.route2.color || '000'}`, color: `#${plan.route2.text_color || 'fff'}`, transform: 'scale(0.7)' }}>
                                                    {plan.route2.short_name}
                                                </div>
                                            </>
                                        ) : (
                                            <div className="route-badge" style={{ backgroundColor: `#${plan.route.color || '000'}`, color: `#${plan.route.text_color || 'fff'}`, transform: 'scale(0.8)' }}>
                                                {plan.route.short_name}
                                            </div>
                                        )}
                                        <span style={{ fontSize: '0.7rem', fontWeight: 'bold', marginLeft: 'auto', opacity: 0.6 }}>
                                            {plan.type === 'transfer' ? '1 Transfer' : 'Direct'}
                                        </span>
                                    </div>
                                    <div className="plan-steps">
                                        {plan.type === 'transfer' ? (
                                            <>
                                                <div className="step">🚌 Ride <b>{plan.route1.short_name}</b> to {plan.hub.stop_name}</div>
                                                <div className="step">🔄 Transfer to <b>{plan.route2.short_name}</b></div>
                                                <div className="step">🚶 Walk {plan.total_walk}km total</div>
                                            </>
                                        ) : (
                                            <>
                                                <div className="step">🚌 Ride <b>{plan.route.short_name}</b></div>
                                                <div className="step">🚶 Walk {plan.total_walk}km total</div>
                                            </>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                <div className="sidebar-footer">
                    <div style={{ display: 'flex', justifyContent: 'center', gap: '10px', marginBottom: '10px' }}>
                        <select
                            value={language}
                            onChange={(e) => setLanguage(e.target.value)}
                            style={{
                                padding: '4px 10px',
                                borderRadius: '12px',
                                background: 'transparent',
                                color: '#444',
                                border: 'none',
                                fontSize: '0.7rem',
                                outline: 'none',
                                appearance: 'none',
                                cursor: 'pointer',
                                textAlign: 'center',
                                width: 'auto',
                                boxShadow: 'none'
                            }}
                        >
                            <option value="en" style={{ background: '#000', color: '#fff' }}>EN</option>
                            <option value="el" style={{ background: '#000', color: '#fff' }}>EL</option>
                            <option value="ru" style={{ background: '#000', color: '#fff' }}>RU</option>
                        </select>
                    </div>
                    <a
                        href="https://t.me/daqxn"
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ textDecoration: 'none' }}
                    >
                        <div className="daan1k-credit">
                            made by @daan1k
                        </div>
                    </a>
                </div>
                <style jsx>{`
                .tab-switcher {
                    display: flex;
                    gap: 5px;
                    background: rgba(255,255,255,0.05);
                    padding: 4px;
                    border-radius: 12px;
                }
                .tab-btn {
                    background: transparent;
                    border: none;
                    color: #666;
                    padding: 4px 12px;
                    border-radius: 8px;
                    font-size: 0.75rem;
                    cursor: pointer;
                    font-weight: 900;
                    transition: all 0.3s ease;
                }
                .tab-btn.active {
                    background: var(--nebula-accent);
                    color: #fff;
                    box-shadow: 0 2px 10px rgba(255, 0, 51, 0.3);
                }
                .planner-form {
                    display: flex;
                    flex-direction: column;
                    gap: 15px;
                    margin-top: 15px;
                }
                .input-group {
                    position: relative;
                }
                .suggestions-list {
                    position: absolute;
                    top: 100%;
                    left: 0;
                    width: 100%;
                    background: rgba(0, 5, 0, 0.98);
                    backdrop-filter: blur(20px);
                    border: 1px solid var(--glass-border);
                    border-top: none;
                    border-radius: 0 0 20px 20px;
                    list-style: none;
                    max-height: 250px;
                    overflow-y: auto;
                    z-index: 3000;
                    box-shadow: 0 10px 40px rgba(0,0,0,0.8);
                    padding: 5px 0;
                    margin-top: -5px;
                }
                .suggestion-item {
                    padding: 12px 15px;
                    display: flex;
                    align-items: center;
                    gap: 12px;
                    border-bottom: 1px solid rgba(255,255,255,0.03);
                    cursor: pointer;
                    transition: background 0.2s ease;
                }
                .suggestion-item:last-child {
                    border-bottom: none;
                }
                .suggestion-item:hover {
                    background: rgba(255, 0, 51, 0.1);
                }
                .suggestion-icon {
                    font-size: 1.1rem;
                    min-width: 24px;
                }
                .suggestion-text {
                    display: flex;
                    flex-direction: column;
                }
                .main-name {
                    font-size: 0.85rem;
                    color: #fff;
                    font-weight: 900;
                }
                .sub-name {
                    font-size: 0.65rem;
                    color: #888;
                    font-weight: 500;
                }
                .planner-input {
                    background: rgba(0,0,0,0.2);
                    border: 1px solid rgba(255,255,255,0.1);
                    padding: 12px;
                    padding-right: 40px;
                    border-radius: 12px;
                    color: #fff;
                    font-size: 0.85rem;
                    width: 100%;
                    transition: border-color 0.3s ease;
                }
                .geo-btn {
                    position: absolute;
                    left: 12px;
                    top: 50%;
                    transform: translateY(-50%);
                    background: transparent;
                    border: none;
                    color: var(--nebula-accent);
                    cursor: pointer;
                    z-index: 5;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    padding: 5px;
                    transition: transform 0.2s ease;
                }
                .geo-btn:hover {
                    transform: translateY(-50%) scale(1.15);
                }
                .planner-input.loading {
                    border-color: var(--nebula-accent);
                }
                .input-spinner {
                    position: absolute;
                    right: 12px;
                    top: 12px;
                    width: 18px;
                    height: 18px;
                    border: 2px solid rgba(255,255,255,0.1);
                    border-top-color: var(--nebula-accent);
                    border-radius: 50%;
                    animation: spin 0.8s linear infinite;
                }
                @keyframes spin {
                    to { transform: rotate(360deg); }
                }
                .plan-submit-btn {
                    background: linear-gradient(135deg, var(--nebula-accent), #900);
                    border: none;
                    padding: 10px;
                    border-radius: 10px;
                    color: #fff;
                    font-weight: 900;
                    cursor: pointer;
                    margin-top: 5px;
                }
                .plan-submit-btn:disabled {
                    opacity: 0.5;
                    cursor: not-allowed;
                }
                .plan-card {
                    background: rgba(255, 255, 255, 0.01);
                    border: 1px solid rgba(255, 0, 51, 0.1);
                    padding: 12px;
                    border-radius: 15px;
                    margin-bottom: 10px;
                    margin-top: 8px;
                    cursor: pointer;
                    transition: all 0.3s cubic-bezier(0.19, 1, 0.22, 1);
                }
                .plan-card:hover {
                    background: rgba(255, 0, 51, 0.04);
                    border-color: var(--nebula-accent);
                    box-shadow: 0 5px 15px rgba(255, 0, 51, 0.1);
                    transform: translateY(-2px);
                }
                .plan-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    margin-bottom: 10px;
                    border-bottom: 1px solid rgba(255, 0, 51, 0.05);
                    padding-bottom: 8px;
                }
                .step {
                    font-size: 0.75rem;
                    color: #aaa;
                    margin-bottom: 6px;
                    display: flex;
                    align-items: center;
                    gap: 8px;
                }
                .step b { color: var(--nebula-accent); }

                .sidebar {
                    position: fixed;
                    top: 25px;
                    bottom: 25px;
                    left: 25px;
                    width: 280px;
                    background: var(--glass-bg);
                    backdrop-filter: var(--glass-blur);
                    border: 1px solid var(--glass-border);
                    z-index: 2000;
                    transition: transform 0.6s cubic-bezier(0.19, 1, 0.22, 1), opacity 0.4s ease;
                    display: flex;
                    flex-direction: column;
                    border-radius: 40px;
                    box-shadow: var(--shadow-quantum);
                }

                .sidebar.is-mobile {
                    top: auto;
                    bottom: 95px;
                    left: 10px;
                    right: 10px;
                    width: calc(100% - 20px);
                    height: 60vh;
                    border-radius: 30px;
                    transform: translateY(150%);
                    opacity: 0;
                    pointer-events: none;
                }

                .sidebar.is-mobile.open {
                    transform: translateY(0);
                    opacity: 1;
                    pointer-events: auto;
                }

                .mobile-bottom-nav {
                    position: fixed;
                    bottom: 15px;
                    left: 15px;
                    right: 15px;
                    height: 70px;
                    background: rgba(0, 5, 0, 0.9);
                    backdrop-filter: blur(20px);
                    border: 1px solid var(--glass-border);
                    border-radius: 25px;
                    z-index: 5000;
                    display: flex;
                    justify-content: space-around;
                    align-items: center;
                    box-shadow: 0 10px 40px rgba(0,0,0,0.8);
                }

                .nav-item {
                    background: none;
                    border: none;
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    gap: 4px;
                    color: #fff;
                    opacity: 0.5;
                    transition: all 0.3s ease;
                    width: 33.3%;
                }

                .nav-item.active {
                    opacity: 1;
                    color: var(--nebula-accent);
                }

                .nav-icon { font-size: 1.4rem; }
                .nav-label { font-size: 0.65rem; font-weight: 800; text-transform: uppercase; }

                .sidebar.closed:not(.is-mobile) {
                    transform: translateX(calc(-100% - 50px));
                }
                .sidebar.open:not(.is-mobile) {
                    transform: translateX(0);
                }
            `}</style>
            </div>
        </>
    );
}
