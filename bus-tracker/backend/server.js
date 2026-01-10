const express = require('express');
const cors = require('cors');
const fs = require('fs');
const csv = require('csv-parser');
const path = require('path');
const axios = require('axios');
const GtfsRealtimeBindings = require('gtfs-realtime-bindings');

const app = express();
const PORT = process.env.PORT || 3001;

console.log("--- SERVER VERSION: V22 (INSTANT START + 5S SYNC) ---");

app.use(cors());
app.use(express.json());

// --- Global Data Stores ---
let stops = [];
let routes = [];
let trips = [];
let stopTimetable = {};
let routeStops = {};
let shapes = {};
let routeShapes = {};
let vehiclePositions = [];
let tripUpdates = {};

// --- 1. The Proxy Config ---
// We prepend this to the URL to route traffic through a clean IP
const PROXY_URL = "https://corsproxy.io/?";

// Standard Axios (No complex headers, the proxy handles it)
const axiosInstance = axios.create({
  timeout: 30000 // 30s timeout
});

// Helper: Get Current Date in YYYYMMDD (Cyprus Time)
function getCyprusDate() {
  const now = new Date();
  now.setHours(now.getHours() + 2);
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  return `${yyyy}${mm}${dd}`;
}

// Helper: Get Day of Week (0-6, 0=Sunday)
function getDayOfWeek() {
  const now = new Date();
  now.setHours(now.getHours() + 2); // Cyprus Time
  return now.getDay();
}

function getDayName(dayIndex) {
  const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  return days[dayIndex];
}

// CSV Processor (with error handling)
function processCSV(filePath, onRow) {
  return new Promise((resolve) => {
    if (!fs.existsSync(filePath)) {
      // console.log(`! File not found: ${filePath}`);
      return resolve();
    }
    fs.createReadStream(filePath)
      .pipe(csv({
        mapHeaders: ({ header, index }) => {
          if (index === 0) return header.replace(/^\ufeff/, '').trim();
          return header.trim();
        }
      }))
      .on('data', (data) => {
        try { onRow(data); } catch (err) { }
      })
      .on('end', resolve)
      .on('error', (err) => {
        console.error(`Error reading ${filePath}:`, err.message);
        resolve();
      });
  });
}

// Fetch Logic
async function fetchData() {
  try {
    const url = 'http://20.19.98.194:8328/Api/api/gtfs-realtime';
    const response = await axiosInstance.get(url, { responseType: 'arraybuffer' });
    const feed = GtfsRealtimeBindings.transit_realtime.FeedMessage.decode(new Uint8Array(response.data));

    const tempPositions = [];
    const tempUpdates = {};

    feed.entity.forEach(entity => {
      if (entity.vehicle) {
        const rawTripId = entity.vehicle.trip?.tripId;
        const rawRouteId = entity.vehicle.trip?.routeId;

        // --- FUZZY MATCHING (NUCLEAR VERSION) ---
        // 1. Try match by trip_id ending with rawTripId
        let trip = trips.find(t => t.trip_id.endsWith(rawTripId));

        // 2. If no trip, try searching by route_id
        if (!trip && rawRouteId) {
          trip = trips.find(t => t.route_id.endsWith(rawRouteId));
        }

        const route = trip ? routes.find(r => r.route_id === trip.route_id) : routes.find(r => r.route_id.endsWith(rawRouteId));

        tempPositions.push({
          vehicle_id: entity.vehicle.vehicle?.id,
          trip_id: trip ? trip.trip_id : rawTripId,
          route_id: route ? route.route_id : rawRouteId,
          lat: entity.vehicle.position?.latitude,
          lon: entity.vehicle.position?.longitude,
          bearing: entity.vehicle.position?.bearing,
          speed: entity.vehicle.position?.speed,
          timestamp: entity.vehicle.timestamp,
          route_short_name: route ? (route.short_name || route.route_short_name) : '?',
          trip_headsign: trip ? trip.trip_headsign : (entity.vehicle.trip?.tripId || '?'),
          color: route ? (route.color || '0070f3') : '000000',
          text_color: route ? (route.text_color || 'FFFFFF') : 'FFFFFF'
        });
      }

      if (entity.tripUpdate) {
        const rawTripId = entity.tripUpdate.trip.tripId;
        const trip = trips.find(t => t.trip_id.endsWith(rawTripId));
        const fullTripId = trip ? trip.trip_id : rawTripId;

        if (!tempUpdates[fullTripId]) tempUpdates[fullTripId] = {};
        if (entity.tripUpdate.stopTimeUpdate) {
          entity.tripUpdate.stopTimeUpdate.forEach(stu => {
            const rawStopId = stu.stopId;
            const stop = stops.find(s => s.stop_id.endsWith(rawStopId));
            const fullStopId = stop ? stop.stop_id : rawStopId;

            const arrival = stu.arrival?.time;
            tempUpdates[fullTripId][fullStopId] = {
              arrival_time: arrival ? (arrival.low || arrival) : null,
              delay: stu.arrival?.delay
            };
          });
        }
      }
    });

    vehiclePositions = tempPositions;
    tripUpdates = tempUpdates;
    console.log(`>>> Global Feed Sync: ${vehiclePositions.length} buses found.`);
  } catch (err) {
    console.error(`X Error fetching Global Feed: ${err.message}`);
  }
}

async function loadData() {
  console.log("Starting Smart Data Load...");
  const TODAY = getCyprusDate();
  const DAY_NAME = getDayName(getDayOfWeek());
  console.log(`Date: ${TODAY}, Day: ${DAY_NAME}`);

  const dataDirs = [
    path.join(__dirname, 'data/other_gtfs/EMEL'),
    path.join(__dirname, 'data/other_gtfs/Intercity buses'),
    path.join(__dirname, 'data/other_gtfs/LPT'),
    path.join(__dirname, 'data/other_gtfs/NPT'),
    path.join(__dirname, 'data/other_gtfs/OSEA (Famagusta)'),
    path.join(__dirname, 'data/other_gtfs/OSYPA (Pafos)'),
    path.join(__dirname, 'data/other_gtfs/PAME EXPRESS'),
  ];

  stops = [];
  routes = [];
  trips = [];
  stopTimetable = {};
  routeStops = {};
  shapes = {};
  routeShapes = {};

  for (const dir of dataDirs) {
    const regionPrefix = path.basename(dir).replace(/[^a-zA-Z0-9]/g, '_').toLowerCase() + '_';
    console.log(`Processing ${path.basename(dir)}...`);

    const activeServices = new Set();
    await processCSV(path.join(dir, 'calendar.txt'), (row) => {
      if (row[DAY_NAME] === '1') {
        activeServices.add(regionPrefix + row.service_id);
      }
    });
    await processCSV(path.join(dir, 'calendar_dates.txt'), (row) => {
      if (row.date === TODAY) {
        if (row.exception_type === '1') activeServices.add(regionPrefix + row.service_id);
        if (row.exception_type === '2') activeServices.delete(regionPrefix + row.service_id);
      }
    });

    // SAFETY FALLBACK: If no services found for today (old data), just take all services
    if (activeServices.size === 0) {
      console.log(`! No active services for ${path.basename(dir)} today. Loading ALL services as fallback.`);
      await processCSV(path.join(dir, 'trips.txt'), (row) => {
        activeServices.add(regionPrefix + row.service_id);
      });
    }

    const stopsFile = fs.existsSync(path.join(dir, 'stops.txt')) ? 'stops.txt' : 'stops.csv';
    const stopsSet = new Set();
    await processCSV(path.join(dir, stopsFile), (row) => {
      const id = row.stop_id || row.code;
      if (id && !stopsSet.has(id)) {
        stopsSet.add(id);
        stops.push({
          stop_id: regionPrefix + id,
          name: row.stop_name || row['description[en]'],
          lat: parseFloat(row.stop_lat || row.lat),
          lon: parseFloat(row.stop_lon || row.lon)
        });
      }
    });

    await processCSV(path.join(dir, 'routes.txt'), (row) => {
      routes.push({
        route_id: regionPrefix + row.route_id,
        short_name: row.route_short_name || '?',
        long_name: row.route_long_name || row.route_desc || '',
        color: row.route_color,
        text_color: row.route_text_color
      });
    });

    const regionTripToRoute = new Map();
    const activeTripsSet = new Set();

    await processCSV(path.join(dir, 'trips.txt'), (row) => {
      const fullServiceId = regionPrefix + row.service_id;
      if (activeServices.has(fullServiceId)) {
        const fullTripId = regionPrefix + row.trip_id;
        const fullRouteId = regionPrefix + row.route_id;
        const fullShapeId = row.shape_id ? regionPrefix + row.shape_id : null;

        trips.push({
          trip_id: fullTripId,
          route_id: fullRouteId,
          service_id: fullServiceId,
          trip_headsign: row.trip_headsign,
          shape_id: fullShapeId
        });
        activeTripsSet.add(fullTripId);
        regionTripToRoute.set(fullTripId, fullRouteId);

        if (fullShapeId) {
          if (!routeShapes[fullRouteId]) routeShapes[fullRouteId] = new Set();
          routeShapes[fullRouteId].add(fullShapeId);
        }
      }
    });

    await processCSV(path.join(dir, 'stop_times.txt'), (row) => {
      const fullTripId = regionPrefix + row.trip_id;
      if (activeTripsSet.has(fullTripId)) {
        const fullStopId = regionPrefix + row.stop_id;
        const arrival = row.arrival_time;
        if (!stopTimetable[fullStopId]) stopTimetable[fullStopId] = [];
        stopTimetable[fullStopId].push({ t: fullTripId, a: arrival });

        const routeId = regionTripToRoute.get(fullTripId);
        if (routeId) {
          if (!routeStops[routeId]) routeStops[routeId] = new Set();
          routeStops[routeId].add(fullStopId);
        }
      }
    });

    const tempShapes = {};
    await processCSV(path.join(dir, 'shapes.txt'), (row) => {
      const shapeId = regionPrefix + row.shape_id;
      if (!tempShapes[shapeId]) tempShapes[shapeId] = [];
      tempShapes[shapeId].push({
        lat: parseFloat(row.shape_pt_lat),
        lon: parseFloat(row.shape_pt_lon),
        seq: parseInt(row.shape_pt_sequence)
      });
    });
    Object.keys(tempShapes).forEach(sid => {
      shapes[sid] = tempShapes[sid].sort((a, b) => a.seq - b.seq).map(pt => [pt.lat, pt.lon]);
    });

    regionTripToRoute.clear();
    activeTripsSet.clear();
    if (global.gc) global.gc();
    await new Promise(r => setTimeout(r, 200));
  }

  console.log(`Smart Data Load Complete! Active Trips: ${trips.length}`);
  fetchData();
  setInterval(fetchData, 5000); // Back to 5s for better responsiveness
}

loadData();

// --- API ---
app.get('/api/stops', (req, res) => res.json(stops));
app.get('/api/routes', (req, res) => res.json(routes));

app.get('/api/routes/:routeId', (req, res) => {
  const { routeId } = req.params;
  const route = routes.find(r => r.route_id === routeId);
  if (!route) return res.status(404).json({ error: "Route not found" });

  const stopIds = routeStops[routeId] ? Array.from(routeStops[routeId]) : [];
  const routeStopDetails = stopIds.map(id => stops.find(s => s.stop_id === id)).filter(Boolean);
  const shapeIds = routeShapes[routeId] ? Array.from(routeShapes[routeId]) : [];
  const routeShapeDetails = shapeIds.map(id => shapes[id]).filter(Boolean);

  res.json({ ...route, stops: routeStopDetails, shapes: routeShapeDetails });
});

app.get('/api/stops/:stopId/timetable', (req, res) => {
  const { stopId } = req.params;
  const rawArrivals = stopTimetable[stopId] || [];
  const results = [];

  for (const item of rawArrivals) {
    const trip = trips.find(t => t.trip_id === item.t);
    if (!trip) continue;

    const route = routes.find(r => r.route_id === trip.route_id);
    let arrivalTime = item.a;
    let isRealtime = false;
    let delay = 0;

    if (tripUpdates[item.t] && tripUpdates[item.t][stopId]) {
      const update = tripUpdates[item.t][stopId];
      if (update.arrival_time) {
        const dateObj = new Date(update.arrival_time * 1000);
        arrivalTime = dateObj.toLocaleTimeString('en-GB', { hour12: false });
        isRealtime = true;
        delay = update.delay;
      }
    }

    results.push({
      route_short_name: route ? route.short_name : '?',
      trip_headsign: trip.trip_headsign,
      route_id: route ? route.route_id : '?',
      arrival_time: arrivalTime,
      is_realtime: isRealtime,
      delay: delay
    });
  }
  results.sort((a, b) => a.arrival_time.localeCompare(b.arrival_time));
  res.json(results);
});

app.get('/api/trips', (req, res) => {
  // Return minimal trip data for frontend matching
  res.json(trips.map(t => ({
    trip_id: t.trip_id,
    route_id: t.route_id,
    trip_headsign: t.trip_headsign
  })));
});

app.get('/api/vehicle_positions', (req, res) => res.json(vehiclePositions));

app.listen(PORT, () => console.log(`Backend running on port ${PORT}`));
