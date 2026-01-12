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

  // 0. Mobile-aware initial state
  useEffect(() => {
    if (window.innerWidth >= 768) {
      setIsSidebarOpen(true); // Open by default only on desktop
    }
  }, []);

  // 1. Fetch initial data (Parallelized)
  useEffect(() => {
    const fetchData = async () => {
      try {
        const [stopsRes, routesRes] = await Promise.all([
          fetch('https://cyfinal.onrender.com/api/stops'),
          fetch('https://cyfinal.onrender.com/api/routes')
        ]);

        const [stopsData, routesData] = await Promise.all([
          stopsRes.json(),
          routesRes.json()
        ]);

        if (Array.isArray(stopsData)) setStops(stopsData);
        if (Array.isArray(routesData)) setRoutes(routesData);
      } catch (err) {
        console.error('Error fetching initial data:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  // 2. Poll Vehicles
  useEffect(() => {
    let isCancelled = false;
    const fetchVehicles = () => {
      fetch('https://cyfinal.onrender.com/api/vehicle_positions')
        .then(res => res.json())
        .then(data => {
          if (!isCancelled) {
            setVehicles(prev => {
              if (!Array.isArray(data)) return prev;
              // Only update if data actually changed (length or first few entries)
              if (prev.length === data.length && JSON.stringify(prev[0]) === JSON.stringify(data[0])) return prev;
              return data;
            });
          }
        })
        .catch(err => {
          // Silence transient network errors
          if (err.name === 'TypeError' && err.message === 'Failed to fetch') {
            console.warn('Network interrupted, retrying...');
          } else {
            console.error('Error fetching vehicles:', err);
          }
        });
    };

    fetchVehicles();
    const interval = setInterval(fetchVehicles, 2000);
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
    setLoading(true);
    if (!route) {
      if (selectedRouteId === null) {
        setLoading(false);
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
        setLoading(false);
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
        if (!data.shapes || data.shapes.length === 0) {
          console.warn('No shapes found for route:', route.route_id);
        }
      } catch (err) {
        console.error('Error fetching route details:', err);
        setShapes([]);
      }
    }
    setLoading(false);
  }, []); // Handlers are stable

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

      {!isSidebarOpen && (
        <button
          className="mobile-menu-toggle"
          onClick={() => setIsSidebarOpen(true)}
          aria-label="Toggle Menu"
        >
          🍔
        </button>
      )}

      <div className="map-container">
        <BusMap
          stops={stops}
          shapes={shapes}
          routes={routes}
          onSelectRoute={handleSelectRoute}
          routeColor={selectedRouteColor}
          onVehicleClick={handleVehicleClick}
          vehicles={vehicles}
          showToast={showToast}
        />
      </div>
    </main>
  );
}
