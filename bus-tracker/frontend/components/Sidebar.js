'use client';

import { useState } from 'react';
import { useLanguage } from '../context/LanguageContext';

export default function Sidebar({ routes, onSelectRoute, selectedRouteId }) {
    const [searchTerm, setSearchTerm] = useState('');
    const { language, setLanguage, t } = useLanguage();

    const filteredRoutes = routes.filter(route =>
        route.short_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        route.long_name.toLowerCase().includes(searchTerm.toLowerCase())
    );

    return (
        <div className="sidebar" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
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
            <div style={{ marginTop: 'auto', padding: '15px', textAlign: 'center', borderTop: '1px solid #eee', background: '#fff' }}>
                <a
                    href="https://t.me/daqxn"
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                        textDecoration: 'none',
                        display: 'block',
                        marginBottom: '8px'
                    }}
                >
                    <div style={{
                        fontWeight: 'bold',
                        fontSize: '0.9rem',
                        color: '#4b0082', // Dark purple base
                        textShadow: '0 0 8px rgba(75, 0, 130, 0.6)',
                        animation: 'multi-toxic-glow 4s linear infinite',
                        transition: 'transform 0.2s'
                    }}
                        onMouseEnter={(e) => e.target.style.transform = 'scale(1.05)'}
                        onMouseLeave={(e) => e.target.style.transform = 'scale(1)'}
                    >
                        Made by @daan1k
                    </div>
                </a>
                <div style={{ fontSize: '0.7rem', color: '#aaa' }}>
                    {t.disclaimer}
                </div>
            </div>
            <style jsx>{`
                @keyframes multi-toxic-glow {
                    0% { 
                        color: #4b0082; 
                        text-shadow: 0 0 10px rgba(75, 0, 130, 0.7); 
                    }
                    33% { 
                        color: #7d00b3; 
                        text-shadow: 0 0 15px rgba(125, 0, 179, 0.9), 0 0 25px rgba(125, 0, 179, 0.5); 
                    }
                    66% { 
                        color: #000080; 
                        text-shadow: 0 0 15px rgba(0, 0, 128, 0.9), 0 0 25px rgba(0, 0, 128, 0.5); 
                    }
                    100% { 
                        color: #4b0082; 
                        text-shadow: 0 0 10px rgba(75, 0, 130, 0.7); 
                    }
                }
            `}</style>
        </div>
    );
}
