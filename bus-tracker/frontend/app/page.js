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
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);

  // 0. Mobile-aware initial state
  useEffect(() => {
    if (window.innerWidth < 768) {
      setIsSidebarOpen(false);
    }
  }, []);

  // 1. Fetch initial data
  useEffect(() => {
    Promise.all([
      fetch('https://cyfinal.onrender.com/api/stops').then(res => res.json()),
      fetch('https://cyfinal.onrender.com/api/routes').then(res => res.json())
    ]).then(([stopsData, routesData]) => {
      setStops(stopsData);
      setRoutes(routesData);
      setLoading(false);
    }).catch(err => {
      console.error('Error fetching initial data:', err);
      setLoading(false);
    });
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
              // Only update if data actually changed (length or first few entries)
              // This is a naive check but helps prevent some re-renders
              if (prev.length === data.length && JSON.stringify(prev[0]) === JSON.stringify(data[0])) return prev;
              return data;
            });
          }
        })
        .catch(err => console.error('Error fetching vehicles:', err));
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
      setSelectedRouteId(null);
      setSelectedRouteColor(null);
      setShapes([]);
      try {
        const res = await fetch('https://cyfinal.onrender.com/api/stops');
        const data = await res.json();
        setStops(data);
      } catch (err) { console.error(err); }
    } else {
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

      <div className="map-container">
        {loading && <div className="loading-overlay">Loading...</div>}
        <BusMap
          stops={stops}
          shapes={shapes}
          routes={routes}
          onSelectRoute={handleSelectRoute}
          routeColor={selectedRouteColor}
          onVehicleClick={handleVehicleClick}
          vehicles={vehicles}
        />
      </div>
    </main>
  );
}
