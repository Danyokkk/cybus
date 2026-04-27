'use client';

import { useState, useEffect, useMemo } from 'react';
import { useLanguage } from '../context/LanguageContext';

export default function Sidebar({
    routes, stops, onSelectRoute, onSelectPlan, onSelectStop, selectedRouteId,
    isOpen, setIsOpen, activeTab, setActiveTab,
    favorites, onToggleFavorite
}) {
    const { t } = useLanguage();
    const [searchTerm, setSearchTerm] = useState('');
    const [origin, setOrigin] = useState('');
    const [destination, setDestination] = useState('');
    const [planResults, setPlanResults] = useState([]);
    const [isPlanning, setIsPlanning] = useState(false);
    const [isMobile, setIsMobile] = useState(false);

    useEffect(() => {
        const handleResize = () => setIsMobile(window.innerWidth < 768);
        handleResize();
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    const filteredRoutes = useMemo(() => {
        return routes.filter(r =>
            r.short_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
            r.long_name?.toLowerCase().includes(searchTerm.toLowerCase())
        );
    }, [routes, searchTerm]);

    const handlePlanRoute = async () => {
        if (!origin || !destination) return;
        setIsPlanning(true);
        try {
            const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'https://cybus.onrender.com';
            const originCoords = stops.find(s => s.name === origin);
            const destCoords = stops.find(s => s.name === destination);
            if (!originCoords || !destCoords) {
                alert("Please select stops from the suggestions");
                setIsPlanning(false);
                return;
            }

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
                            placeholder={t.searchPlaceholder || 'Search...'}
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="search-input"
                        />
                    </div>
                ) : null}
            </div>

            <div className="route-list">
                {activeTab === 'routes' && (
                    filteredRoutes.map((route) => (
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
                    ))
                )}

                {activeTab === 'planner' && (
                    <div className="planner-container">
                        <input
                            list="stops-list"
                            placeholder="From (Origin)"
                            value={origin}
                            onChange={(e) => setOrigin(e.target.value)}
                            className="search-input"
                        />
                        <input
                            list="stops-list"
                            placeholder="To (Destination)"
                            value={destination}
                            onChange={(e) => setDestination(e.target.value)}
                            className="search-input"
                            style={{ marginTop: '10px' }}
                        />
                        <datalist id="stops-list">
                            {stops.map(s => <option key={s.stop_id} value={s.name} />)}
                        </datalist>
                        <button
                            className="plan-btn"
                            onClick={handlePlanRoute}
                            disabled={isPlanning}
                        >
                            {isPlanning ? 'Planning...' : 'Find Route'}
                        </button>

                        <div className="plan-results">
                            {planResults.map((plan, idx) => (
                                <div key={idx} className="plan-card" onClick={() => onSelectPlan(plan)}>
                                    <div className="plan-summary">
                                        {plan.type === 'direct' ? (
                                            <>Ride <b>{plan.route.short_name}</b></>
                                        ) : (
                                            <>Ride <b>{plan.route1.short_name}</b> ➔ <b>{plan.route2.short_name}</b></>
                                        )}
                                    </div>
                                    <div className="plan-details">
                                        Start: {plan.from.name}<br />
                                        End: {plan.to.name}
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
        </div>
    );
}
