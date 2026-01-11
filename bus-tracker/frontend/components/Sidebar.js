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
        <div className={`sidebar ${isOpen ? 'open' : 'closed'}`}>
            <div className="sidebar-header">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
                    <h2>CyBus</h2>
                    <select
                        value={language}
                        onChange={(e) => setLanguage(e.target.value)}
                        style={{
                            padding: '6px 12px',
                            borderRadius: '15px',
                            border: '1px solid rgba(255,255,255,0.1)',
                            background: 'rgba(255,255,255,0.05)',
                            color: '#fff',
                            fontSize: '0.7rem',
                            cursor: 'pointer',
                            outline: 'none'
                        }}
                    >
                        <option value="en">EN</option>
                        <option value="el">EL</option>
                        <option value="ru">RU</option>
                    </select>
                </div>
                <input
                    type="text"
                    placeholder={t.searchPlaceholder || 'Search...'}
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="search-input"
                />
            </div>

            <div className="route-list">
                <button
                    className={`route-item ${!selectedRouteId ? 'active' : ''}`}
                    onClick={() => onSelectRoute(null)}
                >
                    <div className="route-info">
                        <strong>{t.allRoutes}</strong>
                        <span style={{ fontSize: '0.7rem' }}>{t.showAllStops}</span>
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
                            <strong>{route.short_name}</strong>
                            <span>{route.long_name}</span>
                        </div>
                    </button>
                ))}
            </div>

            <div className="sidebar-footer">
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
            </div>
            <style jsx>{`
                /* Deep Nebula Refinement */
            `}</style>
        </div>
    );
}
