'use client';

import { useState, useEffect } from 'react';
import { useLanguage } from '../context/LanguageContext';

export default function Sidebar({ routes, onSelectRoute, selectedRouteId, isOpen, setIsOpen }) {
    const [activeTab, setActiveTab] = useState('routes'); // 'routes' or 'planner'
    const [searchTerm, setSearchTerm] = useState('');
    const { language, setLanguage, t } = useLanguage();

    // Planner State
    const [originQuery, setOriginQuery] = useState('');
    const [originCoords, setOriginCoords] = useState(null);
    const [originSuggestions, setOriginSuggestions] = useState([]);

    const [destQuery, setDestQuery] = useState('');
    const [destCoords, setDestCoords] = useState(null);
    const [destSuggestions, setDestSuggestions] = useState([]);

    const [planResults, setPlanResults] = useState([]);
    const [isPlanning, setIsPlanning] = useState(false);

    // --- Autocomplete Logic ---
    useEffect(() => {
        const timer = setTimeout(async () => {
            if (originQuery && !originCoords) {
                try {
                    const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(originQuery)}&viewbox=32.2,34.5,34.6,35.6&bounded=1`);
                    const data = await res.json();
                    setOriginSuggestions(data);
                } catch (err) {
                    console.error("Autocomplete fetch error", err);
                }
            } else {
                setOriginSuggestions([]);
            }
        }, 500);
        return () => clearTimeout(timer);
    }, [originQuery, originCoords]);

    useEffect(() => {
        const timer = setTimeout(async () => {
            if (destQuery && !destCoords) {
                try {
                    const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(destQuery)}&viewbox=32.2,34.5,34.6,35.6&bounded=1`);
                    const data = await res.json();
                    setDestSuggestions(data);
                } catch (err) {
                    console.error("Autocomplete fetch error", err);
                }
            } else {
                setDestSuggestions([]);
            }
        }, 500);
        return () => clearTimeout(timer);
    }, [destQuery, destCoords]);

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
            const planRes = await fetch(`https://cyfinal.onrender.com/api/plan-route?lat1=${originCoords.lat}&lon1=${originCoords.lon}&lat2=${destCoords.lat}&lon2=${destCoords.lon}`);
            const plans = await planRes.json();
            setPlanResults(plans);
        } catch (e) {
            console.error(e);
        }
        setIsPlanning(false);
    };

    return (
        <div className={`sidebar ${isOpen ? 'open' : 'closed'}`}>
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

            <div className="sidebar-header">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                        <h2 style={{ fontSize: '1.6rem', margin: 0 }}>CyBus</h2>
                        <div className="tab-switcher">
                            <button
                                className={`tab-btn ${activeTab === 'routes' ? 'active' : ''}`}
                                onClick={() => setActiveTab('routes')}
                            >
                                Routes
                            </button>
                            <button
                                className={`tab-btn ${activeTab === 'planner' ? 'active' : ''}`}
                                onClick={() => setActiveTab('planner')}
                            >
                                Plan
                            </button>
                        </div>
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
                                className="planner-input"
                                placeholder="From (Start typing...)"
                                value={originQuery}
                                onChange={e => { setOriginQuery(e.target.value); setOriginCoords(null); }}
                            />
                            {originSuggestions.length > 0 && (
                                <ul className="suggestions-list">
                                    {originSuggestions.map((s, i) => (
                                        <li key={i} onClick={() => selectOrigin(s)}>
                                            {s.display_name.split(',')[0]}
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </div>

                        <div className="input-group">
                            <input
                                className="planner-input"
                                placeholder="To (Start typing...)"
                                value={destQuery}
                                onChange={e => { setDestQuery(e.target.value); setDestCoords(null); }}
                            />
                            {destSuggestions.length > 0 && (
                                <ul className="suggestions-list">
                                    {destSuggestions.map((s, i) => (
                                        <li key={i} onClick={() => selectDest(s)}>
                                            {s.display_name.split(',')[0]}
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </div>

                        <button className="plan-submit-btn" onClick={handlePlanRoute} disabled={!originCoords || !destCoords}>
                            {isPlanning ? 'Analyzing...' : 'Find Route'}
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
                                Use suggestions to select exact start and end points in Cyprus.
                            </div>
                        )}
                        {planResults.map((plan, i) => (
                            <div key={i} className="plan-card" onClick={() => onSelectRoute(plan.route)}>
                                <div className="plan-header">
                                    <div className="route-badge" style={{
                                        backgroundColor: `#${plan.route.color || '000'}`,
                                        color: `#${plan.route.text_color || 'fff'}`,
                                        transform: 'scale(0.8)'
                                    }}>
                                        {plan.route.short_name}
                                    </div>
                                    <span style={{ fontSize: '0.8rem', fontWeight: 'bold' }}>Best Match</span>
                                </div>
                                <div className="plan-steps">
                                    <div className="step">🚶 Walk {plan.walk_start}km from Start</div>
                                    <div className="step">🚌 Ride <b>{plan.route.short_name}</b></div>
                                    <div className="step">🚶 Walk {plan.walk_end}km to Destination</div>
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
                            color: '#555',
                            border: 'none',
                            fontSize: '0.7rem',
                            outline: 'none',
                            appearance: 'none',
                            cursor: 'pointer',
                            textAlign: 'center'
                        }}
                    >
                        <option value="en">EN</option>
                        <option value="el">EL</option>
                        <option value="ru">RU</option>
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
                    box-shadow: 0 2px 10px rgba(72, 52, 212, 0.3);
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
                    background: rgba(10, 10, 46, 0.95);
                    border: 1px solid rgba(255,255,255,0.1);
                    border-radius: 12px;
                    list-style: none;
                    max-height: 150px;
                    overflow-y: auto;
                    z-index: 3000;
                    box-shadow: 0 4px 20px rgba(0,0,0,0.5);
                    padding: 0; /* Added to remove default ul padding */
                    margin: 5px 0 0 0; /* Added to give some space below input */
                }
                .suggestions-list li {
                    padding: 10px;
                    font-size: 0.8rem;
                    border-bottom: 1px solid rgba(255,255,255,0.05);
                    cursor: pointer;
                    color: #ddd;
                }
                .suggestions-list li:last-child {
                    border-bottom: none; /* Remove border for the last item */
                }
                .suggestions-list li:hover {
                    background: rgba(255,255,255,0.1);
                    color: #fff;
                }
                .planner-input {
                    background: rgba(0,0,0,0.2);
                    border: 1px solid rgba(255,255,255,0.1);
                    padding: 12px;
                    border-radius: 12px;
                    color: #fff;
                    font-size: 0.85rem;
                    width: 100%;
                }
                .plan-submit-btn {
                    background: linear-gradient(135deg, var(--nebula-accent), #6c5ce7);
                    border: none;
                    padding: 12px;
                    border-radius: 12px;
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
                    background: rgba(255,255,255,0.03);
                    border: 1px solid rgba(255,255,255,0.05);
                    padding: 15px;
                    border-radius: 20px;
                    margin-bottom: 15px;
                    cursor: pointer;
                    transition: all 0.3s ease;
                }
                .plan-card:hover {
                    background: rgba(255,255,255,0.06);
                    transform: translateY(-2px);
                }
                .plan-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    margin-bottom: 12px;
                    border-bottom: 1px solid rgba(255,255,255,0.05);
                    padding-bottom: 10px;
                }
                .step {
                    font-size: 0.75rem;
                    color: #aaa;
                    margin-bottom: 6px;
                    display: flex;
                    align-items: center;
                    gap: 8px;
                }
                .step b { color: #fff; }
            `}</style>
        </div>
    );
}
