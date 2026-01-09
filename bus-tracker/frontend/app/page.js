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
  const [shapes, setShapes] = useState([]); // Array of arrays of points
  const [selectedRouteId, setSelectedRouteId] = useState(null);
  const [selectedRouteColor, setSelectedRouteColor] = useState(null);
  const [loading, setLoading] = useState(true);

  // 1. Fetch initial data (all stops and all routes)
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

  // 2. Handle Route Selection
  const handleSelectRoute = async (route) => {
    setLoading(true);
    if (!route) {
      // Reset to all stops
      setSelectedRouteId(null);
      setSelectedRouteColor(null);
      setShapes([]);
      try {
        const res = await fetch('https://cyfinal.onrender.com/api/stops');
        const data = await res.json();
        setStops(data);
      } catch (err) { console.error(err); }
    } else {
      // Fetch specific route details
      setSelectedRouteId(route.route_id);
      setSelectedRouteColor(route.color);
      try {
        const res = await fetch(`https://cyfinal.onrender.com/api/routes/${route.route_id}`);
        const data = await res.json();
        // data.stops contains the stops for this route
        // data.shapes contains the line segments
        setStops(data.stops);
        setShapes(data.shapes || []);
      } catch (err) { console.error(err); }
    }
    setLoading(false);
  };

  // 3. Handle Vehicle Click (Show route on map)
  const handleVehicleClick = (vehicle) => {
    // Find route by fuzzy match (in case of prefix mismatch)
    const route = routes.find(r => r.route_id === vehicle.route_id);
    if (route) {
      handleSelectRoute(route);
    } else {
      console.warn('Route not found for vehicle:', vehicle.route_id);
    }
  };

  return (
    <main className="main-container">
      <Sidebar
        routes={routes}
        onSelectRoute={handleSelectRoute}
        selectedRouteId={selectedRouteId}
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
        />
      </div>
    </main>
  );
}
