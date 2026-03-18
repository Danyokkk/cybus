'use client';
import dynamic from 'next/dynamic';
import { useEffect, useState, useCallback, useRef } from 'react';
import Sidebar from '../components/Sidebar';
import { useLanguage } from '../context/LanguageContext';
import { useQuery } from "convex/react";
import { api } from "../convex/_generated/api";

// Dynamic import for BusMap component
const BusMap = dynamic(() => import('../components/Map'), {
  ssr: false,
  loading: () => <div className="loading-map">Loading Map...</div>
});

export default function Home() {
  // Pre-warm the backend as early as possible
  useEffect(() => {
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'https://cyfinal.onrender.com';
    fetch(`${apiUrl}/api/vehicle_positions`, { method: 'HEAD', mode: 'no-cors' }).catch(() => { });
  }, []);

  const { language, setLanguage, t } = useLanguage();
  const [stops, setStops] = useState([]);
  const [routes, setRoutes] = useState([]);
  const [shapes, setShapes] = useState([]);
  const [selectedRouteId, setSelectedRouteId] = useState(null);
  const [selectedRouteColor, setSelectedRouteColor] = useState(null);
  const [selectedPlan, setSelectedPlan] = useState(null);
  const [vehicles, setVehicles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false); // Default to false for mobile-first
  const [activeTab, setActiveTab] = useState('routes');
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [showStops, setShowStops] = useState(false);
  const [isSatellite, setIsSatellite] = useState(true); // Default to satellite view as requested
  const [favorites, setFavorites] = useState([]);
  const [toast, setToast] = useState(null);

  // Helper to show toasts
  const showToast = useCallback((msg, duration = 3000) => {
    setToast(msg);
    setTimeout(() => setToast(null), duration);
  }, []);

  // 0. Mobile-aware initial state & Resize handling
  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth >= 768) {
        setIsSidebarOpen(true);
      }
    };

    // Load favorites from local storage
    const savedFavs = localStorage.getItem('cybus_favorites');
    if (savedFavs) {
      try {
        setFavorites(JSON.parse(savedFavs));
      } catch (e) {
        console.error("Error loading favorites", e);
      }
    }

    handleResize(); // Initial check
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Update localStorage when favorites change
  useEffect(() => {
    localStorage.setItem('cybus_favorites', JSON.stringify(favorites));
  }, [favorites]);

  const toggleFavorite = useCallback((stop) => {
    setFavorites(prev => {
      const isFav = prev.some(f => f.stop_id === stop.stop_id);
      if (isFav) {
        showToast(`Removed from favorites: ${stop.name}`);
        return prev.filter(f => f.stop_id !== stop.stop_id);
      } else {
        showToast(`Added to favorites: ${stop.name}`);
        return [...prev, stop];
      }
    });
  }, [showToast]);

  // 1. Fetch initial data (Parallelized with Caching)
  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        // Cached Data Check
        const cachedStops = localStorage.getItem('cybus_stops');
        const cachedRoutes = localStorage.getItem('cybus_routes');
        const cacheTime = localStorage.getItem('cybus_cache_time');
        const isCacheValid = cacheTime && (Date.now() - parseInt(cacheTime) < 24 * 60 * 60 * 1000); // 24h validity

        if (cachedStops && cachedRoutes && isCacheValid) {
          setStops(JSON.parse(cachedStops));
          setRoutes(JSON.parse(cachedRoutes));
          setLoading(false); // Immediate load complete
          // Optional: Background refresh could go here if needed
        } else {
          // Fresh Fetch
          const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'https://cyfinal.onrender.com';
          const [stopsRes, routesRes] = await Promise.all([
            fetch(`${apiUrl}/api/stops`),
            fetch(`${apiUrl}/api/routes`)
          ]);

          const [stopsData, routesData] = await Promise.all([
            stopsRes.json(),
            routesRes.json()
          ]);

          if (Array.isArray(stopsData)) {
            setStops(stopsData);
            localStorage.setItem('cybus_stops', JSON.stringify(stopsData));
          }
          if (Array.isArray(routesData)) {
            setRoutes(routesData);
            localStorage.setItem('cybus_routes', JSON.stringify(routesData));
          }
          localStorage.setItem('cybus_cache_time', Date.now().toString());
          setLoading(false);
        }
      } catch (err) {
        console.error('Error fetching initial data:', err);
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  // 2. Convex Real-time Sync
  const convexVehicles = useQuery(api.vehicles.getVehicles) || [];
  
  // Sync the ultra-fast convex data to our local state so Map handles it natively
  useEffect(() => {
    if (convexVehicles.length > 0) {
      setVehicles(convexVehicles);
      if (loading) setLoading(false);
    }
  }, [convexVehicles, loading]);

  // Auto-close sidebar on mobile after route selection
  const handleSelectRoute = useCallback(async (route) => {
    console.log('Selecting Route:', route);
    if (window.innerWidth < 768) {
      setIsSidebarOpen(false);
    }
    if (!route) {
      if (selectedRouteId === null) {
        return; // Already null, avoid redundant work
      }
      setSelectedRouteId(null);
      setSelectedRouteColor(null);
      setSelectedPlan(null);
      setShapes([]);
      try {
        const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'https://cyfinal.onrender.com';
        const res = await fetch(`${apiUrl}/api/stops`);
        const data = await res.json();
        setStops(data);
      } catch (err) { console.error(err); }
    } else {
      if (selectedRouteId === route.route_id) {
        return; // Avoid double loading same route
      }
      setSelectedRouteId(route.route_id);
      setSelectedRouteColor(route.color || '0070f3');
      try {
        const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'https://cyfinal.onrender.com';
        const res = await fetch(`${apiUrl}/api/routes/${route.route_id}`);
        const data = await res.json();
        console.log('Route Detailed Data:', data);
        setStops(data.stops || []);
        setShapes(data.shapes || []);
      } catch (err) {
        console.error('Error fetching route details:', err);
        setShapes([]);
      }
    }
  }, [selectedRouteId, routes]); // Handlers are stable

  const handleSelectPlan = useCallback((plan) => {
    if (window.innerWidth < 768) setIsSidebarOpen(false);
    setSelectedPlan(plan);
    const route = plan?.type === 'transfer' ? plan.route1 : plan?.route;
    if (route) handleSelectRoute(route);
  }, [handleSelectRoute]);

  // Close sidebar on mobile when bus is clicked
  const handleVehicleClick = useCallback((v) => {
    console.log('Vehicle Clicked:', v);
    if (window.innerWidth < 768) setIsSidebarOpen(false);

    const routeId = v.r || v.route_id;
    const routeShortName = v.sn || v.route_short_name;

    // 1. Try match by exact route_id
    let route = routes.find(r => r.route_id === routeId);

    // 2. Fallback: match by short_name if ID fails (sometimes IDs change or are partial)
    if (!route && routeShortName) {
      console.warn(`Route ID mismatch (${routeId}), trying fallback by name: ${routeShortName}`);
      route = routes.find(r => r.short_name === routeShortName || r.route_short_name === routeShortName);
    }

    if (route) {
      console.log('Routing to:', route.route_id);
      handleSelectRoute(route);
    } else {
      console.error('Could not find route for vehicle:', v);
    }
  }, [routes, handleSelectRoute]);

  return (
    <main className={`main-container ${isSidebarOpen ? 'sidebar-open' : 'sidebar-closed'}`}>
      <Sidebar
        routes={routes}
        stops={stops}
        onSelectRoute={handleSelectRoute}
        onSelectPlan={handleSelectPlan}
        selectedRouteId={selectedRouteId}
        isOpen={isSidebarOpen}
        setIsOpen={setIsSidebarOpen}
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        favorites={favorites}
        toggleFavorite={toggleFavorite}
      />

      <div className="mobile-floating-dock">
        <div className="dock-container">
          <button
            className={`dock-item ${isSidebarOpen && activeTab === 'routes' ? 'active' : ''}`}
            onClick={() => {
              if (isSidebarOpen && activeTab === 'routes') {
                setIsSidebarOpen(false);
              } else {
                setIsSidebarOpen(true);
                setActiveTab('routes');
              }
            }}
          >
            <span className="icon">🚌</span>
            <span className="label">Routes</span>
          </button>
          <button
            className={`dock-item ${isSidebarOpen && activeTab === 'favorites' ? 'active' : ''}`}
            onClick={() => {
              if (isSidebarOpen && activeTab === 'favorites') {
                setIsSidebarOpen(false);
              } else {
                setIsSidebarOpen(true);
                setActiveTab('favorites');
              }
            }}
          >
            <span className="icon">❤️</span>
            <span className="label">Favs</span>
          </button>
          <button
            className={`dock-item ${isSidebarOpen && activeTab === 'planner' ? 'active' : ''}`}
            onClick={() => {
              if (isSidebarOpen && activeTab === 'planner') {
                setIsSidebarOpen(false);
              } else {
                setIsSidebarOpen(true);
                setActiveTab('planner');
              }
            }}
          >
            <span className="icon">🪄</span>
            <span className="label">Plan</span>
          </button>
          <button
            className={`dock-item ${showStops ? 'active' : ''}`}
            onClick={() => setShowStops(!showStops)}
          >
            <span className="icon">🚏</span>
            <span className="label">Stops</span>
          </button>
          <button
            className={`dock-item ${isSatellite ? 'active' : ''}`}
            onClick={() => setIsSatellite(!isSatellite)}
          >
            <span className="icon">🛰️</span>
            <span className="label">Style</span>
          </button>
          <button
            className="dock-item"
            id="mobile-location-btn" // For Map.js to listen to
            onClick={() => {
              const pcBtn = document.getElementById('my-location-btn');
              if (pcBtn) pcBtn.click();
            }}
          >
            <span className="icon">🎯</span>
            <span className="label">Me</span>
          </button>
          <button
            className={`dock-item ${isSettingsOpen ? 'active' : ''}`}
            onClick={() => { setIsSettingsOpen(!isSettingsOpen); setIsSidebarOpen(false); }}
          >
            <span className="icon">⚙️</span>
            <span className="label">Settings</span>
          </button>
        </div>
      </div>

      {isSettingsOpen && (
        <div className="settings-drawer shadow-quantum">
          <div className="settings-header">
            <h3>Quick Settings</h3>
            <button className="close-btn" onClick={() => setIsSettingsOpen(false)}>✕</button>
          </div>
          <div className="settings-content">
            <div className="setting-card">
              <span className="icon">🌍</span>
              <div className="text">
                <strong>Language / Язык</strong>
                <div className="lang-group">
                  <button className={language === 'en' ? 'active' : ''} onClick={() => setLanguage('en')}>EN</button>
                  <button className={language === 'ru' ? 'active' : ''} onClick={() => setLanguage('ru')}>RU</button>
                  <button className={language === 'el' ? 'active' : ''} onClick={() => setLanguage('el')}>EL</button>
                </div>
              </div>
            </div>
            <div className="setting-card" onClick={() => { if (confirm("Refresh all data?")) window.location.reload(); }}>
              <span className="icon">🔄</span>
              <div className="text">
                <strong>Reboot System</strong>
                <p>Reload GTFS & Real-time data</p>
              </div>
            </div>
            <div className="setting-card">
              <span className="icon">🌐</span>
              <div className="text">
                <strong>Join Community</strong>
                <p>Updates on Telegram @daqxn</p>
              </div>
            </div>
          </div>
          <div className="bar-credit" style={{ background: 'transparent', marginTop: 'auto' }}>made by @daan1k</div>
        </div>
      )}

      {loading && (
        <div className="loading-overlay" style={{ background: '#000' }}>
          <div className="loader-logo" style={{ color: '#ff0033', textTransform: 'uppercase', letterSpacing: '4px' }}>
            CYPRUS BUS V2
          </div>
          <div style={{ color: '#888', fontSize: '0.8rem', marginTop: '10px' }}>
            Waking up server (may take 30s)...
          </div>
          <div className="loader-bar-container" style={{ marginTop: '20px' }}>
            <div className="loader-bar-progress" style={{ background: 'linear-gradient(90deg, transparent, #ff0033, transparent)' }}></div>
          </div>
        </div>
      )}

      {toast && (
        <div className="toast-pilling">
          {toast}
        </div>
      )}

      <div className="map-container">
        <BusMap
          stops={stops}
          shapes={shapes}
          routes={routes}
          selectedPlan={selectedPlan}
          onSelectRoute={handleSelectRoute}
          routeColor={selectedRouteColor}
          onVehicleClick={handleVehicleClick}
          vehicles={selectedRouteId
            ? vehicles.filter(v => (v.r || v.route_id) === selectedRouteId)
            : vehicles
          }
          showToast={showToast}
          showStops={showStops}
          setShowStops={setShowStops}
          isSatellite={isSatellite}
          setIsSatellite={setIsSatellite}
          isOpen={isSidebarOpen}
          setIsOpen={setIsSidebarOpen}
          favorites={favorites}
          toggleFavorite={toggleFavorite}
        />
      </div>
    </main>
  );
}
