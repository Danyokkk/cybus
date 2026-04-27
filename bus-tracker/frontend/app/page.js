'use client';
import dynamic from 'next/dynamic';
import { useEffect, useState, useCallback, useRef } from 'react';
import Sidebar from '../components/Sidebar';
import { useLanguage } from '../context/LanguageContext';

// Dynamic import for BusMap component
const BusMap = dynamic(() => import('../components/Map'), {
  ssr: false,
  loading: () => <div className="loading-map">Loading Map...</div>
});

export default function Home() {
  // Pre-warm the backend as early as possible
  useEffect(() => {
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'https://cybus.onrender.com';
    fetch(`${apiUrl}/api/vehicle_positions`, { method: 'HEAD', mode: 'no-cors' }).catch(() => { });
  }, []);

  const { language, setLanguage, t } = useLanguage();
  const [stops, setStops] = useState([]);
  const [routes, setRoutes] = useState([]);
  const [shapes, setShapes] = useState([]);
  const [selectedRouteId, setSelectedRouteId] = useState(null);
  const [selectedRouteColor, setSelectedRouteColor] = useState(null);
  const [selectedPlan, setSelectedPlan] = useState(null);
  const [selectedStopId, setSelectedStopId] = useState(null);
  const [vehicles, setVehicles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isConnected, setIsConnected] = useState(true);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false); // Default to false for mobile-first
  const [activeTab, setActiveTab] = useState('routes');
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [showStops, setShowStops] = useState(false);
  const [isSatellite, setIsSatellite] = useState(true); // Default to satellite view as requested
  const [toast, setToast] = useState(null);
  const [favorites, setFavorites] = useState([]);

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
      } else {
        setIsSidebarOpen(false);
      }
    };

    handleResize(); // Initial check
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Load favorites from localStorage
  useEffect(() => {
    const saved = localStorage.getItem('cybus_favorites');
    if (saved) {
      try {
        setFavorites(JSON.parse(saved));
      } catch (e) {
        console.error("Error loading favorites", e);
      }
    }
  }, []);

  const toggleFavorite = useCallback((stopId) => {
    setFavorites(prev => {
      const isFav = prev.includes(stopId);
      const newFavs = isFav ? prev.filter(id => id !== stopId) : [...prev, stopId];
      localStorage.setItem('cybus_favorites', JSON.stringify(newFavs));
      showToast(isFav ? "Removed from Favorites" : "Added to Favorites", 2000);
      return newFavs;
    });
  }, [showToast]);

  // 1. Fetch initial data (Parallelized with Caching)
  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const cachedStops = localStorage.getItem('cybus_stops');
        const cachedRoutes = localStorage.getItem('cybus_routes');
        const cacheTime = localStorage.getItem('cybus_cache_time');
        const isCacheValid = cacheTime && (Date.now() - parseInt(cacheTime) < 24 * 60 * 60 * 1000); // 24h validity

        if (cachedStops && cachedRoutes && isCacheValid) {
          setStops(JSON.parse(cachedStops));
          setRoutes(JSON.parse(cachedRoutes));
          setLoading(false); 
        } else {
          const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'https://cybus.onrender.com';
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

  // 2. Direct Polling for vehicles (Render Server) - Replaced WebSocket
  useEffect(() => {
    let intervalId;
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'https://cybus.onrender.com';

    const fetchVehicles = async () => {
      try {
        const res = await fetch(`${apiUrl}/api/v2/vehicles`);
        if (!res.ok) throw new Error('Refresh failed');
        const data = await res.json();
        
        // Map compact format to objects with legacy property support for Leaflet Map
        const mapped = data.map(v => ({
            id: v[0], r: v[1], lt: v[2], ln: v[3], b: v[4], sn: v[5], c: v[6], h: v[7],
            vehicle_id: v[0], route_id: v[1], lat: v[2], lon: v[3], bearing: v[4], route_short_name: v[5], color: v[6], headsign: v[7]
        }));

        setVehicles(mapped);
        setIsConnected(true);
        if (loading) setLoading(false);
      } catch (err) {
        console.warn('Real-time update failed, retrying...', err.message);
        setIsConnected(false);
      }
    };

    fetchVehicles();
    intervalId = setInterval(fetchVehicles, 5000); 
    return () => clearInterval(intervalId);
  }, []);

  // Auto-close sidebar on mobile after route selection
  const handleSelectRoute = useCallback(async (route) => {
    if (window.innerWidth < 768) {
      setIsSidebarOpen(false);
    }
    if (!route) {
      if (selectedRouteId === null) return;
      setSelectedRouteId(null);
      setSelectedRouteColor(null);
      setSelectedPlan(null);
      setShapes([]);
      try {
        const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'https://cybus.onrender.com';
        const res = await fetch(`${apiUrl}/api/stops`);
        const data = await res.json();
        setStops(data);
      } catch (err) { console.error(err); }
    } else {
      if (selectedRouteId === route.route_id) return;
      setSelectedRouteId(route.route_id);
      setSelectedRouteColor(route.color || '0070f3');
      setSelectedPlan(null); // Clear plan when route is selected
      try {
        const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'https://cybus.onrender.com';
        const res = await fetch(`${apiUrl}/api/routes/${route.route_id}`);
        const data = await res.json();
        setStops(data.stops || []);
        setShapes(data.shapes || []);
      } catch (err) {
        console.error('Error fetching route details:', err);
        setShapes([]);
      }
    }
  }, [selectedRouteId, routes]);

  const handleSelectPlan = useCallback((plan) => {
    if (window.innerWidth < 768) setIsSidebarOpen(false);
    setSelectedPlan(plan);
    setSelectedStopId(null);
    const route = plan?.type === 'transfer' ? plan.route1 : plan?.route;
    if (route) handleSelectRoute(route);
  }, [handleSelectRoute]);

  const handleSelectStop = useCallback((stopId) => {
    if (window.innerWidth < 768) setIsSidebarOpen(false);
    setSelectedStopId(stopId);
    setSelectedPlan(null);
    setShowStops(true);
  }, []);

  // Close sidebar on mobile when bus is clicked
  const handleVehicleClick = useCallback((v) => {
    if (window.innerWidth < 768) setIsSidebarOpen(false);
    const routeId = v.r || v.route_id;
    const routeShortName = v.sn || v.route_short_name;
    let route = routes.find(r => r.route_id === routeId);
    if (!route && routeShortName) {
      route = routes.find(r => r.short_name === routeShortName || r.route_short_name === routeShortName);
    }
    if (route) handleSelectRoute(route);
  }, [routes, handleSelectRoute]);

  return (
    <main className={`main-container ${isSidebarOpen ? 'sidebar-open' : 'sidebar-closed'}`}>
      <div className="system-status-card">
        <div className="status-indicator">
          <div className={`status-dot ${isConnected ? 'online' : ''}`}></div>
          <span className="status-text">{isConnected ? 'ONLINE' : 'OFFLINE'}</span>
        </div>
        <div className="status-buses-count">
          {vehicles.length} BUSES
        </div>
      </div>

      <Sidebar
        routes={routes}
        stops={stops}
        onSelectRoute={handleSelectRoute}
        onSelectPlan={handleSelectPlan}
        onSelectStop={handleSelectStop}
        selectedRouteId={selectedRouteId}
        isOpen={isSidebarOpen}
        setIsOpen={setIsSidebarOpen}
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        favorites={favorites}
        onToggleFavorite={toggleFavorite}
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
            id="mobile-location-btn" 
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
          </div>
          <div className="bar-credit" style={{ background: 'transparent', marginTop: 'auto' }}>made by @daan1k</div>
        </div>
      )}

      {loading && (
        <div className="loading-overlay">
          <div className="loader-logo">
            Initializing
          </div>
          <div className="loader-text">
            OPTIMIZING ENGINE...
          </div>
          <div className="loader-bar-container">
            <div className="loader-bar-progress"></div>
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
          selectedStopId={selectedStopId}
          setSelectedStopId={setSelectedStopId}
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
          onToggleFavorite={toggleFavorite}
        />
      </div>
    </main>
  );
}
