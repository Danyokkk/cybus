'use client';

import { useState, useEffect } from 'react';
import { useLanguage } from '../context/LanguageContext';

export default function Sidebar({ routes, stops, onSelectRoute, onSelectPlan, onSelectStop, selectedRouteId, isOpen, setIsOpen, activeTab, setActiveTab, favorites, onToggleFavorite }) {
    const [searchTerm, setSearchTerm] = useState('');
    const { language, t } = useLanguage();
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

    // Calculate indicator position for sliding tabs
    const getIndicatorStyle = () => {
        const tabs = ['routes', 'planner', 'favorites'];
        const index = tabs.indexOf(activeTab);
        return {
            left: `\${(index * 100) / 3}%`,
            width: '33.33%'
        };
    };

    return (
        <div className={`sidebar \${isOpen ? 'open' : 'closed'} \${isMobile ? 'is-mobile' : ''}`}>
            <div className="sidebar-header">
                <div className="header-top-row">
                    <div className="sidebar-logo-shell">CyBus</div>
                    <div className="tab-bubble-container">
                        <div className="tab-bubble-indicator" style={getIndicatorStyle()}></div>
                        <button className={`tab-bubble-btn \${activeTab === 'routes' ? 'active' : ''}`} onClick={() => setActiveTab('routes')}>Routes</button>
                        <button className={`tab-bubble-btn \${activeTab === 'planner' ? 'active' : ''}`} onClick={() => setActiveTab('planner')}>Plan</button>
                        <button className={`tab-bubble-btn \${activeTab === 'favorites' ? 'active' : ''}`} onClick={() => setActiveTab('favorites')}>⭐</button>
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
                        <div className="agency-chips">
                            {['All', ...new Set(routes.map(r => r.agency_name).filter(Boolean))].map(agency => (
                                <button 
                                    key={agency}
                                    onClick={() => setSelectedAgency(agency)}
                                    className={`chip \${selectedAgency === agency ? 'active' : ''}`}
                                    style={{
                                        background: selectedAgency === agency ? 'var(--nebula-accent)' : 'rgba(255,255,255,0.05)',
                                        color: selectedAgency === agency ? '#000' : '#fff',
                                        padding: '4px 12px',
                                        borderRadius: '20px',
                                        fontSize: '0.65rem',
                                        border: 'none',
                                        cursor: 'pointer',
                                        whiteSpace: 'nowrap'
                                    }}
                                >
                                    {agency}
                                </button>
                            ))}
                        </div>
                    </div>
                ) : activeTab === 'favorites' ? (
                    <div className="favorites-header">
                        Saved Stops
                    </div>
                ) : (
                    <div className="planner-form">
                        <input className="search-input" placeholder="From..." value={originQuery} onChange={e => {setOriginQuery(e.target.value); setOriginCoords(null);}} />
                        <input className="search-input" style={{marginTop: '8px'}} placeholder="To..." value={destQuery} onChange={e => {setDestQuery(e.target.value); setDestCoords(null);}} />
                        <button className="route-item" onClick={handlePlanRoute} style={{marginTop: '15px', background: 'var(--nebula-accent)', color: '#000', justifyContent: 'center', fontWeight: 'bold'}}>
                            {isPlanning ? 'Analyzing...' : 'Find Route'}
                        </button>
                    </div>
                )}
            </div>

            <div className="route-list">
                {activeTab === 'routes' && routes && routes.filter(r => {
                    const matchesSearch = (r.short_name || '').toLowerCase().includes(searchTerm.toLowerCase()) || 
                                         (r.long_name || '').toLowerCase().includes(searchTerm.toLowerCase());
                    const matchesAgency = selectedAgency === 'All' || r.agency_name === selectedAgency;
                    return matchesSearch && matchesAgency;
                }).map((route) => (
                    <div key={route.route_id} className={`route-item \${selectedRouteId === route.route_id ? 'active' : ''}`} onClick={() => onSelectRoute(route)}>
                        <div className="route-badge" style={{ backgroundColor: route.color ? (route.color.startsWith('#') ? route.color : '#' + route.color) : 'var(--nebula-accent)', color: '#fff' }}>
                            {route.short_name}
                        </div>
                        <div className="route-name" style={{ fontSize: '0.75rem', flex: 1 }}>{route.long_name}</div>
                    </div>
                ))}

                {activeTab === 'favorites' && (
                    <div className="favorites-list">
                        {favorites && favorites.length > 0 ? (
                            favorites.map(fId => {
                                const stop = stops.find(s => s.stop_id === fId);
                                if (!stop) return null;
                                return (
                                    <div key={fId} className="route-item" style={{ justifyContent: 'space-between' }}>
                                        <div className="stop-info" style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: 1 }} onClick={() => onSelectStop(fId)}>
                                            <div className="route-badge" style={{ background: 'rgba(255,255,255,0.05)', minWidth: '40px' }}>🚏</div>
                                            <div style={{ fontSize: '0.75rem' }}>{stop.name}</div>
                                        </div>
                                        <button onClick={(e) => { e.stopPropagation(); onToggleFavorite(fId); }} style={{ background: 'none', border: 'none', color: 'var(--nebula-accent)', fontSize: '1.2rem', cursor: 'pointer' }}>⭐</button>
                                    </div>
                                );
                            })
                        ) : (
                            <div style={{ textAlign: 'center', padding: '40px 20px', color: '#666', fontSize: '0.75rem' }}>No saved stops yet. Star a stop on the map!</div>
                        )}
                    </div>
                )}
                
                {activeTab === 'planner' && planResults && planResults.length > 0 && (
                    <div className="planner-results">
                        {planResults.map((plan, i) => (
                            <div key={i} className="route-item" onClick={() => onSelectPlan(plan)}>
                                <div className="plan-header" style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                                    {plan.type === 'transfer' ? (
                                        <>
                                            <div className="route-badge" style={{ backgroundColor: `#\${plan.route1.color || '000'}` }}>{plan.route1.short_name}</div>
                                            <span>➜</span>
                                            <div className="route-badge" style={{ backgroundColor: `#\${plan.route2.color || '000'}` }}>{plan.route2.short_name}</div>
                                        </>
                                    ) : (
                                        <div className="route-badge" style={{ backgroundColor: `#\${plan.route?.color || '000'}` }}>{plan.route?.short_name || '...'}</div>
                                    )}
                                </div>
                                <div style={{ fontSize: '0.6rem', opacity: 0.8 }}>{plan.total_walk}km walk</div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            <div className="sidebar-footer">
                <div className="daan1k-credit">made by @daan1k</div>
            </div>
        </div>
    );
}
