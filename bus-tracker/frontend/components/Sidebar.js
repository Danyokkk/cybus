'use client';

import { useState } from 'react';
import { useLanguage } from '../context/LanguageContext';

export default function Sidebar({ routes, onSelectRoute, selectedRouteId, isOpen, setIsOpen }) {
    const [activeTab, setActiveTab] = useState('routes'); // 'routes' or 'planner'
    const [searchTerm, setSearchTerm] = useState('');
    const { language, setLanguage, t } = useLanguage();

    // Planner State
    const [origin, setOrigin] = useState('');
    const [dest, setDest] = useState('');
    const [planResults, setPlanResults] = useState([]);
    const [isPlanning, setIsPlanning] = useState(false);

    const filteredRoutes = routes.filter(route =>
        (route.short_name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (route.long_name || '').toLowerCase().includes(searchTerm.toLowerCase())
    );

    const handlePlanRoute = async () => {
        setIsPlanning(true);
        // Quick dirty geocode simulation (In real app use Google Places or similar)
        // For V1 we assume user enters "Chanion 11" and "My Mall" and we map them to coords manually for demo
        // OR we just search stops by name.
        // Let's search stops by name to get coords.

        try {
            // Fetch ALL stops to find matches (Frontend optimization needed later)
            const res = await fetch('https://cyfinal.onrender.com/api/stops');
            const stops = await res.json();

            const startStop = stops.find(s => s.name.toLowerCase().includes(origin.toLowerCase()));
            const endStop = stops.find(s => s.name.toLowerCase().includes(dest.toLowerCase()));

            if (startStop && endStop) {
                const planRes = await fetch(`https://cyfinal.onrender.com/api/plan-route?lat1=${startStop.lat}&lon1=${startStop.lon}&lat2=${endStop.lat}&lon2=${endStop.lon}`);
                const plans = await planRes.json();
                setPlanResults(plans);
            } else {
                alert('Could not solve location names. Try "Mall" or "Zoo".');
                setPlanResults([]);
            }
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
                {isOpen ? '‹' : '›'}
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
                        <input className="planner-input" placeholder="From (e.g. Chanion)" value={origin} onChange={e => setOrigin(e.target.value)} />
                        <input className="planner-input" placeholder="To (e.g. My Mall)" value={dest} onChange={e => setDest(e.target.value)} />
                        <button className="plan-submit-btn" onClick={handlePlanRoute}>
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
                                Enter locations to find the best direct bus route.
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
                                    <div className="step">🚶 Walk {plan.walk_start}km to <b>{plan.from.name}</b></div>
                                    <div className="step">🚌 Ride <b>{plan.route.short_name}</b></div>
                                    <div className="step">🚶 Walk {plan.walk_end}km from <b>{plan.to.name}</b></div>
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
                            background: 'rgba(255,255,255,0.05)',
                            color: '#777',
                            border: 'none',
                            fontSize: '0.7rem'
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
                    gap: 10px;
                    margin-top: 15px;
                }
                .planner-input {
                    background: rgba(0,0,0,0.2);
                    border: 1px solid rgba(255,255,255,0.1);
                    padding: 12px;
                    border-radius: 12px;
                    color: #fff;
                    font-size: 0.85rem;
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
