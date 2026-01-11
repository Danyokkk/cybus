'use client';

import { useState } from 'react';
import { useLanguage } from '../context/LanguageContext';

export default function Sidebar({ routes, onSelectRoute, selectedRouteId, isOpen }) {
    const [searchTerm, setSearchTerm] = useState('');
    const { language, setLanguage, t } = useLanguage();

    const filteredRoutes = routes.filter(route =>
        route.short_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        route.long_name.toLowerCase().includes(searchTerm.toLowerCase())
    );

    return (
        <div className={`sidebar ${isOpen ? 'open' : 'closed'}`} style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
            <div className="sidebar-header">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                    <h2>CyBus</h2>
                    <select
                        value={language}
                        onChange={(e) => setLanguage(e.target.value)}
                        style={{
                            padding: '8px 12px',
                            borderRadius: '20px',
                            border: '1px solid #ddd',
                            fontFamily: 'Unbounded, sans-serif',
                            fontSize: '0.8rem',
                            outline: 'none',
                            cursor: 'pointer'
                        }}
                    >
                        <option value="en">EN</option>
                        <option value="el">EL</option>
                        <option value="ru">RU</option>
                    </select>
                </div>
                <input
                    type="text"
                    placeholder={t.searchPlaceholder}
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="search-input"
                />
            </div>
            <div className="route-list" style={{ flex: 1, overflowY: 'auto' }}>
                <button
                    className={`route-item ${!selectedRouteId ? 'active' : ''}`}
                    onClick={() => onSelectRoute(null)}
                >
                    <strong>{t.allRoutes}</strong>
                    <span>{t.showAllStops}</span>
                </button>
                {filteredRoutes.map(route => (
                    <button
                        key={route.route_id}
                        className={`route-item ${selectedRouteId === route.route_id ? 'active' : ''}`}
                        onClick={() => onSelectRoute(route)}
                    >
                        <div className="route-badge" style={{ backgroundColor: `#${route.color || '000000'}`, color: `#${route.text_color || 'FFFFFF'}` }}>
                            {route.short_name}
                        </div>
                        <div className="route-info">
                            <span>{route.long_name}</span>
                        </div>
                    </button>
                ))}
            </div>
            <div style={{ marginTop: 'auto', padding: '20px', textAlign: 'center', borderTop: '1px solid var(--glass-border)', background: 'transparent' }}>
                <a
                    href="https://t.me/daqxn"
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ textDecoration: 'none' }}
                >
                    <div className="daan1k-credit">
                        Made by @daan1k
                    </div>
                </a>
                <div style={{ fontSize: '0.75rem', color: '#666', marginTop: '12px', fontWeight: 'bold' }}>
                    {t.disclaimer}
                </div>
            </div>
            <style jsx>{`
                /* Scoped styles for refinement if needed, but mostly using globals.css classes */
            `}</style>
        </div>
    );
}
