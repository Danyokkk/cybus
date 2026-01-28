'use client';
import dynamic from 'next/dynamic';
import { useEffect, useState, useCallback } from 'react';
import Sidebar from '../components/Sidebar';

// Dynamic import for BusMap component
const BusMap = dynamic(() => import('../components/Map'), {
  ssr: false,
  loading: () => <div className="loading-map">Loading Map...</div>
});

export default function Home() {
  const [stops, setStops] = useState([]);
  const [routes, setRoutes] = useState([]);
  const [shapes, setShapes] = useState([]);
  const [selectedRouteId, setSelectedRouteId] = useState(null);
  const [selectedRouteColor, setSelectedRouteColor] = useState(null);
  const [vehicles, setVehicles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false); // Default to false for mobile-first
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

    handleResize(); // Initial check
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

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
          const [stopsRes, routesRes] = await Promise.all([
            fetch('https://cyfinal.onrender.com/api/stops'),
            fetch('https://cyfinal.onrender.com/api/routes')
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

  // 2. Poll Vehicles (with Caching)
  useEffect(() => {
    let isCancelled = false;

    // Load cached vehicles immediately for "Instance Spawn"
    const cachedVehicles = localStorage.getItem('cybus_vehicles');
    const vCacheTime = localStorage.getItem('cybus_v_cache_time');
    if (cachedVehicles && vCacheTime && (Date.now() - parseInt(vCacheTime) < 2 * 60 * 1000)) { // 2 min cache
      setVehicles(JSON.parse(cachedVehicles));
    }

    const fetchVehicles = () => {
      fetch('https://cyfinal.onrender.com/api/vehicle_positions')
        .then(res => res.json())
        .then(data => {
          if (!isCancelled && Array.isArray(data)) {
            setVehicles(data);
            localStorage.setItem('cybus_vehicles', JSON.stringify(data));
            localStorage.setItem('cybus_v_cache_time', Date.now().toString());
          }
        })
        .catch(err => {
          if (err.name === 'TypeError' && err.message === 'Failed to fetch') {
            console.warn('Network interrupted, retrying...');
          } else {
            console.error('Error fetching vehicles:', err);
          }
        });
    };

    fetchVehicles();
    const interval = setInterval(fetchVehicles, 3000);
    return () => {
      isCancelled = true;
      clearInterval(interval);
    };
  }, []);

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
      setShapes([]);
      try {
        const res = await fetch('https://cyfinal.onrender.com/api/stops');
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
        const res = await fetch(`https://cyfinal.onrender.com/api/routes/${route.route_id}`);
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
      <div className="mobile-credit-bar">
        <div className="mobile-daan1k">made by @daan1k</div>
      </div>

      <Sidebar
        routes={routes}
        onSelectRoute={handleSelectRoute}
        selectedRouteId={selectedRouteId}
        isOpen={isSidebarOpen}
        setIsOpen={setIsSidebarOpen}
      />

      {loading && (
        <div className="loading-overlay">
          <div className="loader-logo">CyBus</div>
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
          onSelectRoute={handleSelectRoute}
          routeColor={selectedRouteColor}
          onVehicleClick={handleVehicleClick}
          vehicles={selectedRouteId
            ? vehicles.filter(v => (v.r || v.route_id) === selectedRouteId)
            : vehicles
          }
          showToast={showToast}
        />
      </div>
    </main>
  );
}
