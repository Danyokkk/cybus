const express = require('express');
const cors = require('cors');
const fs = require('fs');
const csv = require('csv-parser');
const path = require('path');
const axios = require('axios');
const GtfsRealtimeBindings = require('gtfs-realtime-bindings');

const app = express();
const PORT = process.env.PORT || 3001;

console.log("--- SERVER VERSION: V24 (HYPER-OPTIMIZED + HQ MAP) ---");

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

// --- Fast Lookup Maps (Hyper-Optimization) ---
let stopMap = {};
let routeMap = {};
let tripMap = {};

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

        // --- ULTRA-FAST LOOKUP ---
        let trip = tripMap[rawTripId];
        if (!trip) {
          // If no exact match, fallback to fuzzy only if necessary
          // But with maps we should index both full and partial if possible
        }

        const route = trip ? routeMap[trip.route_id] : routeMap[rawRouteId];

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
          color: route ? (route.color || '0070f3') : '0070f3',
          text_color: route ? (route.text_color || 'FFFFFF') : 'FFFFFF',
          agency_name: route ? route.agency_name : 'Cyprus Public Transport'
        });
      }

      if (entity.tripUpdate) {
        const rawTripId = entity.tripUpdate.trip.tripId;
        const trip = tripMap[rawTripId];
        const fullTripId = trip ? trip.trip_id : rawTripId;

        if (!tempUpdates[fullTripId]) tempUpdates[fullTripId] = {};
        if (entity.tripUpdate.stopTimeUpdate) {
          entity.tripUpdate.stopTimeUpdate.forEach(stu => {
            const rawStopId = stu.stopId;
            const stop = stopMap[rawStopId];
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

    // Minimized payload for bandwidth efficiency
    vehiclePositions = tempPositions.map(v => ({
      id: v.vehicle_id,
      t: v.trip_id,
      r: v.route_id,
      lt: v.lat,
      ln: v.lon,
      b: v.bearing,
      s: v.speed || 0,
      h: v.trip_headsign || 'Route ' + v.route_short_name,
      sn: v.route_short_name,
      c: v.color,
      ag: v.agency_name
    }));
    tripUpdates = tempUpdates;
    console.log(`>>> Sync: ${vehiclePositions.length} buses. Speed: O(1).`);
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
        const stopObj = {
          stop_id: regionPrefix + id,
          name: row.stop_name || row['description[en]'],
          lat: parseFloat(row.stop_lat || row.lat),
          lon: parseFloat(row.stop_lon || row.lon)
        };
        stops.push(stopObj);
        stopMap[stopObj.stop_id] = stopObj;
        stopMap[id] = stopObj; // Direct access for RT
      }
    });

    const agencyNames = new Map();
    await processCSV(path.join(dir, 'agency.txt'), (row) => {
      agencyNames.set(row.agency_id, row.agency_name);
    });

    await processCSV(path.join(dir, 'routes.txt'), (row) => {
      const rObj = {
        route_id: regionPrefix + row.route_id,
        short_name: row.route_short_name || '?',
        long_name: row.route_long_name || row.route_desc || '',
        color: row.route_color,
        text_color: row.route_text_color,
        agency_name: agencyNames.get(row.agency_id) || path.basename(dir)
      };
      routes.push(rObj);
      routeMap[rObj.route_id] = rObj;
      routeMap[row.route_id] = rObj; // Direct access
    });

    const regionTripToRoute = new Map();
    const activeTripsSet = new Set();

    await processCSV(path.join(dir, 'trips.txt'), (row) => {
      const fullServiceId = regionPrefix + row.service_id;
      if (activeServices.has(fullServiceId)) {
        const fullTripId = regionPrefix + row.trip_id;
        const fullRouteId = regionPrefix + row.route_id;
        const fullShapeId = row.shape_id ? regionPrefix + row.shape_id : null;

        const tObj = {
          trip_id: fullTripId,
          route_id: fullRouteId,
          service_id: fullServiceId,
          trip_headsign: row.trip_headsign,
          shape_id: fullShapeId
        };
        trips.push(tObj);
        tripMap[fullTripId] = tObj;
        tripMap[row.trip_id] = tObj; // Suffix match for RT

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

    const tempShapes = new Map();
    await processCSV(path.join(dir, 'shapes.txt'), (row) => {
      const shapeId = regionPrefix + row.shape_id;
      if (!tempShapes.has(shapeId)) tempShapes.set(shapeId, []);
      tempShapes.get(shapeId).push({
        lt: parseFloat(row.shape_pt_lat),
        ln: parseFloat(row.shape_pt_lon),
        s: parseInt(row.shape_pt_sequence)
      });
    });

    for (const [sid, pts] of tempShapes.entries()) {
      shapes[sid] = pts.sort((a, b) => a.s - b.s).map(pt => [pt.lt, pt.ln]);
    }
    tempShapes.clear();

    regionTripToRoute.clear();
    activeTripsSet.clear();
    if (global.gc) global.gc();
    await new Promise(r => setTimeout(r, 50));
  }

  console.log(`Smart Data Load Complete! Active Trips: ${trips.length}`);
  fetchData();
  setInterval(fetchData, 1000); // 1s sync for maximum speed
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

// --- Route Planner Logic (V1 - Direct Connections) ---
function getDistance(lat1, lon1, lat2, lon2) {
  const R = 6371; // Radius of the earth in km
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c; // Distance in km
}

app.get('/api/plan-route', (req, res) => {
  const { lat1, lon1, lat2, lon2 } = req.query;
  if (!lat1 || !lon1 || !lat2 || !lon2) {
    return res.status(400).json({ error: "Missing coordinates" });
  }

  const startLat = parseFloat(lat1);
  const startLon = parseFloat(lon1);
  const endLat = parseFloat(lat2);
  const endLon = parseFloat(lon2);

  // 1. Find Stops near Origin (within 1km)
  const startStops = stops.filter(s => getDistance(startLat, startLon, s.lat, s.lon) < 1.0)
    .sort((a, b) => getDistance(startLat, startLon, a.lat, a.lon) - getDistance(startLat, startLon, b.lat, b.lon))
    .slice(0, 20); // Top 20 nearest stops

  // 2. Find Stops near Destination (within 1km)
  const endStops = stops.filter(s => getDistance(endLat, endLon, s.lat, s.lon) < 1.0)
    .sort((a, b) => getDistance(endLat, endLon, a.lat, a.lon) - getDistance(endLat, endLon, b.lat, b.lon))
    .slice(0, 20);

  // 3. Find Matching Routes
  let matches = [];

  startStops.forEach(startStop => {
    // Find all routes passing through this start stop
    // We scan routeStops, but since it's a map we can iterate Active Trips or Routes
    // Optimization: Iterate Routes and check if they contain both stops 
    // Better: We pre-computed routeStops[routeId] as a Set of StopIDs
  });

  // Re-approach: Iterate all known routes and check if they have a stop in Start AND a stop in End
  Object.keys(routeStops).forEach(routeId => {
    const routeStopSet = routeStops[routeId];

    const validStart = startStops.find(s => routeStopSet.has(s.stop_id));
    const validEnd = endStops.find(s => routeStopSet.has(s.stop_id));

    if (validStart && validEnd) {
      // It's a match! Check direction (basic: index check if we had order, but Set doesn't have order)
      // For V1 we assume if both are on the route, it's valid.
      const routeDetails = routes.find(r => r.route_id === routeId);

      const walk1 = getDistance(startLat, startLon, validStart.lat, validStart.lon).toFixed(2);
      const walk2 = getDistance(endLat, endLon, validEnd.lat, validEnd.lon).toFixed(2);

      if (routeDetails) {
        matches.push({
          route: routeDetails,
          from: validStart,
          to: validEnd,
          walk_start: walk1,
          walk_end: walk2,
          total_walk: (parseFloat(walk1) + parseFloat(walk2)).toFixed(2)
        });
      }
    }
  });

  // Sort by minimal walking distance
  matches.sort((a, b) => a.total_walk - b.total_walk);

  // Deduplicate by route short name
  const uniqueMatches = [];
  const seenRoutes = new Set();
  for (const m of matches) {
    if (!seenRoutes.has(m.route.short_name)) {
      seenRoutes.add(m.route.short_name);
      uniqueMatches.push(m);
    }
  }

  res.json(uniqueMatches.slice(0, 5)); // Return top 5 options
});

app.listen(PORT, () => console.log(`Backend running on port ${PORT}`));
