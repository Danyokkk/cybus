const express = require('express');
const cors = require('cors');
const fs = require('fs');
const csv = require('csv-parser');
const path = require('path');
const axios = require('axios');
const GtfsRealtimeBindings = require('gtfs-realtime-bindings');

const app = express();
const http = require('http');
const { Server } = require('socket.io');
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

const PORT = process.env.PORT || 3001;

console.log("--- CYPRUS BUS V2 by daan1k (HYPER-OPTIMIZED) ---");

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

// Standard Axios with realistic User-Agent to avoid blocks
const axiosInstance = axios.create({
  timeout: 30000,
  headers: {
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': '*/*'
  }
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
    console.log(`>>> Fetching RT Feed: ${url}`);
    const response = await axiosInstance.get(url, { responseType: 'arraybuffer' });
    if (!response.data || response.data.length === 0) throw new Error("Empty response from feed");
    const feed = GtfsRealtimeBindings.transit_realtime.FeedMessage.decode(new Uint8Array(response.data));

    const tempPositions = [];
    const tempUpdates = {};

    feed.entity.forEach(entity => {
      if (entity.vehicle) {
        const rawTripId = entity.vehicle.trip?.tripId;
        const rawRouteId = entity.vehicle.trip?.routeId;

        // --- ULTRA-FAST LOOKUP ---
        let trip = tripMap[rawTripId];
        const route = trip ? routeMap[trip.route_id] : routeMap[rawRouteId];

        // --- DYNAMIC FARE MAPPING ---
        let fare = null;
        const sn = route ? (route.short_name || route.route_short_name) : null;
        const agency = route ? route.agency_name : '';

        if (sn === '30' && (agency.includes('EMEL') || agency.includes('ΕΜΕΛ') || agency.includes('Limassol'))) {
          fare = '€2.00';
        } else if (sn === '56' && (agency.includes('INTERCITY') || agency.includes('OSYPA') || agency.includes('ΟΣΥΠΑ') || agency.includes('Pafos') || agency.includes('Paphos'))) {
          fare = '€5.00';
        }

        // Determine best display names
        const routeShortName = route ? (route.short_name || route.route_short_name) : '??';
        const headsign = trip ? trip.trip_headsign : (route ? route.long_name : 'Cyprus Bus');

        tempPositions.push({
          vehicle_id: entity.vehicle.vehicle?.id,
          trip_id: trip ? trip.trip_id : rawTripId,
          route_id: route ? route.route_id : rawRouteId,
          lat: entity.vehicle.position?.latitude,
          lon: entity.vehicle.position?.longitude,
          bearing: entity.vehicle.position?.bearing,
          speed: entity.vehicle.position?.speed,
          timestamp: entity.vehicle.timestamp,
          route_short_name: routeShortName,
          route_long_name: route ? route.long_name : 'Cyprus Public Transport',
          trip_headsign: headsign,
          color: route ? (route.color || '0070f3') : '0070f3',
          text_color: route ? (route.text_color || 'FFFFFF') : 'FFFFFF',
          agency_name: route ? route.agency_name : 'Cyprus Public Transport',
          fare: fare
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
      r: v.route_id,
      lt: v.lt || v.lat,
      ln: v.ln || v.lon,
      b: v.b !== undefined ? v.b : v.bearing,
      s: v.s !== undefined ? v.s : (v.speed || 0),
      h: v.trip_headsign,
      sn: v.route_short_name,
      c: v.color,
      rn: v.route_long_name,
      f: v.fare // Added fare field
    }));
    tripUpdates = tempUpdates;

    // Broadcast to all connected clients
    io.emit('vehiclePositions', vehiclePositions);

    console.log(`>>> Sync: ${vehiclePositions.length} buses. Emitted to ${io.engine.clientsCount} clients.`);
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
          if (!routeStops[routeId]) routeStops[routeId] = [];
          if (!routeStops[routeId].includes(fullStopId)) {
            routeStops[routeId].push(fullStopId);
          }
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

  // High-frequency polling for Realtime updates (Recursive timeout to prevent overlap)
  const scheduleFetch = () => {
    setTimeout(async () => {
      await fetchData();
      scheduleFetch();
    }, 10000);
  };
  scheduleFetch();

  // Daily GTFS reload (to update active services for the new day)
  if (global.reloadInterval) clearInterval(global.reloadInterval);
  global.reloadInterval = setInterval(loadData, 24 * 60 * 60 * 1000);
}

loadData();

// --- SELF-PING SYSTEM (Render Keep-Alive) ---
// Pings the server every 10 seconds to prevent Render from sleeping
setInterval(() => {
  const RENDER_URL = process.env.RENDER_EXTERNAL_URL || 'https://cybus.onrender.com';
  axios.get(`${RENDER_URL}/api/ping`)
    .then(() => console.log(`>>> [Keep-Alive] Ping successful to ${RENDER_URL}`))
    .catch(err => console.error(`! [Keep-Alive] Ping failed: ${err.message}`));
}, 10000);

// --- WebSocket Events ---
io.on('connection', (socket) => {
  console.log(`+ Client connected: ${socket.id}`);

  // Send initial data immediately
  if (vehiclePositions.length > 0) {
    socket.emit('vehiclePositions', vehiclePositions);
  }

  socket.on('disconnect', () => {
    console.log(`- Client disconnected: ${socket.id}`);
  });
});

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

// --- API V2: Ultra-compact for free-tier bandwidth (Maps only) ---
app.get('/api/v2/vehicles', (req, res) => {
  // Returns only what's needed for markers: [id, routeId, lat, lon, bearing, shortName, color, headsign]
  const compact = vehiclePositions.map(v => [
    v.id, v.r, v.lt, v.ln, v.b, v.sn, v.c, v.h
  ]);
  res.json(compact);
});

// --- PING: For uptime monitors to keep Render alive 24/7 ---
app.get('/api/ping', (req, res) => res.send('pong'));

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

  const startStopsFound = stops.filter(s => getDistance(startLat, startLon, s.lat, s.lon) < 3.5)
    .sort((a, b) => getDistance(startLat, startLon, a.lat, a.lon) - getDistance(startLat, startLon, b.lat, b.lon))
    .slice(0, 30);

  const endStopsFound = stops.filter(s => getDistance(endLat, endLon, s.lat, s.lon) < 3.5)
    .sort((a, b) => getDistance(endLat, endLon, a.lat, a.lon) - getDistance(endLat, endLon, b.lat, b.lon))
    .slice(0, 30);

  let matches = [];
  const seenDirectRoutes = new Set();

  // --- 1. Direct Routes ---
  Object.keys(routeStops).forEach(routeId => {
    const routeStopArray = routeStops[routeId];
    let startIndex = -1;
    let foundStartStop = null;
    for (let i = 0; i < routeStopArray.length; i++) {
      const potentialStart = startStopsFound.find(s => s.stop_id === routeStopArray[i]);
      if (potentialStart) { startIndex = i; foundStartStop = potentialStart; break; }
    }

    if (startIndex !== -1) {
      let foundEndStop = null;
      for (let i = startIndex + 1; i < routeStopArray.length; i++) {
        const potentialEnd = endStopsFound.find(s => s.stop_id === routeStopArray[i]);
        if (potentialEnd) { foundEndStop = potentialEnd; }
      }

      if (foundEndStop) {
        const routeDetails = routes.find(r => r.route_id === routeId);
        if (routeDetails) {
          seenDirectRoutes.add(routeDetails.short_name);
          matches.push({
            type: 'direct',
            route: routeDetails,
            from: foundStartStop,
            to: foundEndStop,
            total_walk: (parseFloat(getDistance(startLat, startLon, foundStartStop.lat, foundStartStop.lon)) +
              parseFloat(getDistance(endLat, endLon, foundEndStop.lat, foundEndStop.lon))).toFixed(2)
          });
        }
      }
    }
  });

  // --- 2. Transfer Routes (1 Transfer) ---
  if (matches.length < 5) {
    const startRoutesMap = {};
    const endRoutesMap = {};

    Object.keys(routeStops).forEach(rId => {
      const sStop = startStopsFound.find(s => routeStops[rId].includes(s.stop_id));
      if (sStop) startRoutesMap[rId] = sStop;

      const eStop = endStopsFound.find(s => routeStops[rId].includes(s.stop_id));
      if (eStop) endRoutesMap[rId] = eStop;
    });

    const startRIds = Object.keys(startRoutesMap);
    const endRIds = Object.keys(endRoutesMap);

    for (const r1Id of startRIds) {
      for (const r2Id of endRIds) {
        if (r1Id === r2Id) continue;

        const r1Stops = routeStops[r1Id];
        const r2Stops = routeStops[r2Id];
        const r1StartStop = startRoutesMap[r1Id];
        const r1StartIndex = r1Stops.indexOf(r1StartStop.stop_id);

        const r2EndStop = endRoutesMap[r2Id];
        const r2EndIndex = r2Stops.indexOf(r2EndStop.stop_id);

        // Optimization: slice to look only at relevant segments
        const r1Segment = r1Stops.slice(r1StartIndex + 1);
        const r2Segment = r2Stops.slice(0, r2EndIndex);

        let fuzzyHub = null;
        for (const s1Id of r1Segment.slice(0, 40)) { // Limit search depth
          const s1 = stopMap[s1Id];
          if (!s1) continue;

          // Check if any stop in R2 segment is physically close to s1
          const found = r2Segment.find(s2Id => {
            const s2 = stopMap[s2Id];
            return s2 && getDistance(s1.lat, s1.lon, s2.lat, s2.lon) < 0.3; // 300m
          });

          if (found) {
            fuzzyHub = stopMap[found];
            break;
          }
        }

        if (fuzzyHub) {
          const route1 = routes.find(r => r.route_id === r1Id);
          const route2 = routes.find(r => r.route_id === r2Id);

          if (route1 && route2) {
            matches.push({
              type: 'transfer',
              route1,
              route2,
              from: r1StartStop,
              hub: fuzzyHub,
              to: r2EndStop,
              total_walk: (parseFloat(getDistance(startLat, startLon, r1StartStop.lat, r1StartStop.lon)) +
                parseFloat(getDistance(endLat, endLon, r2EndStop.lat, r2EndStop.lon))).toFixed(2)
            });
          }
        }
        if (matches.length >= 10) break;
      }
      if (matches.length >= 10) break;
    }
  }

  const tripDistance = getDistance(startLat, startLon, endLat, endLon);

  // Sort by minimal walking distance, but prioritize Intercity for long trips
  matches.sort((a, b) => {
    if (tripDistance > 20) {
      const isAInter = (a.type === 'direct' ? a.route.long_name : a.route1.long_name).includes('Intercity');
      const isBInter = (b.type === 'direct' ? b.route.long_name : b.route1.long_name).includes('Intercity');
      if (isAInter && !isBInter) return -1;
      if (!isAInter && isBInter) return 1;
    }
    return a.total_walk - b.total_walk;
  });

  // Deduplicate by route combinations
  const finalResults = [];
  const seenResults = new Set();
  for (const m of matches) {
    const key = m.type === 'direct' ? m.route.short_name : `${m.route1.short_name}_${m.route2.short_name}`;
    if (!seenResults.has(key)) {
      seenResults.add(key);
      finalResults.push(m);
    }
  }

  res.json(finalResults.slice(0, 5));
});

server.listen(PORT, () => console.log(`Backend running on port ${PORT} (WebSocket Ready)`));
