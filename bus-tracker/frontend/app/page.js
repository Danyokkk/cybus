'use client';
import dynamic from 'next/dynamic';
import { useEffect, useState } from 'react';
import Sidebar from '../components/Sidebar';

// Dynamic import for Map component
const Map = dynamic(() => import('../components/Map'), {
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
    const fetchVehicles = () => {
      fetch('https://cyfinal.onrender.com/api/vehicle_positions')
        .then(res => res.json())
        .then(data => setVehicles(data))
        .catch(err => console.error('Error fetching vehicles:', err));
    };

    fetchVehicles();
    const interval = setInterval(fetchVehicles, 5000);
    return () => clearInterval(interval);
  }, []);

  // Auto-close sidebar on mobile after route selection
  const handleSelectRoute = async (route) => {
    if (window.innerWidth < 768) {
      setIsSidebarOpen(false);
    }
    setLoading(true);
    if (!route) {
      // ... (rest of reset logic)
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
      setSelectedRouteColor(route.color);
      try {
        const res = await fetch(`https://cyfinal.onrender.com/api/routes/${route.route_id}`);
        const data = await res.json();
        setStops(data.stops);
        setShapes(data.shapes || []);
      } catch (err) { console.error(err); }
    }
    setLoading(false);
  };

  // Close sidebar on mobile when bus is clicked
  const handleVehicleClick = (v) => {
    if (window.innerWidth < 768) setIsSidebarOpen(false);
    const route = routes.find(r => r.route_id === v.route_id);
    if (route) handleSelectRoute(route);
  };

  return (
    <main className={`main-container ${isSidebarOpen ? 'sidebar-open' : 'sidebar-closed'}`}>
      {/* Mobile Toggle Button */}
      <button
        className="mobile-sidebar-toggle"
        onClick={() => setIsSidebarOpen(!isSidebarOpen)}
      >
        {isSidebarOpen ? '✕' : '☰'}
      </button>

      <Sidebar
        routes={routes}
        onSelectRoute={handleSelectRoute}
        selectedRouteId={selectedRouteId}
        isOpen={isSidebarOpen}
      />

      <div className="map-container">
        {loading && <div className="loading-overlay">Loading...</div>}
        <Map
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
