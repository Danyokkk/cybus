const express = require('express');
const cors = require('cors');
const fs = require('fs');
const csv = require('csv-parser');
const path = require('path');
const axios = require('axios');
const https = require('https');
const GtfsRealtimeBindings = require('gtfs-realtime-bindings');

const app = express();
const PORT = process.env.PORT || 3001;

console.log("--- SERVER VERSION: V8 (STEALTH MODE + COOL-DOWN) ---");

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

// --- 1. The Stealth Headers ---
// Simplified headers to look less suspicious and avoid "Header Too Large" (432) errors.
const STEALTH_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': '*/*',
  'Connection': 'close', // Close connection to avoid tracking
  'Host': 'opendata.cyprusbus.transport.services' // Required for SNI
};

// --- 2. HTTPS Agent (Fresh Connection) ---
const httpsAgent = new https.Agent({
  rejectUnauthorized: false, // Ignore cert errors
  keepAlive: false           // Force new connection every time
});

const axiosInstance = axios.create({
  httpsAgent: httpsAgent,
  headers: STEALTH_HEADERS,
  timeout: 20000 // 20 second timeout
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

// CSV Processor
function processCSV(filePath, onRow) {
  return new Promise((resolve) => {
    if (!fs.existsSync(filePath)) return resolve();
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
      .on('error', () => resolve());
  });
}

// Fetch Logic
async function processFeed(url, regionPrefix, tempPositions, tempUpdates) {
  try {
    const response = await axiosInstance.get(url, { responseType: 'arraybuffer' });
    const feed = GtfsRealtimeBindings.transit_realtime.FeedMessage.decode(new Uint8Array(response.data));

    feed.entity.forEach(entity => {
      if (entity.vehicle) {
        const rawTripId = entity.vehicle.trip?.tripId;
        const fullTripId = regionPrefix + rawTripId;
        const trip = trips.find(t => t.trip_id === fullTripId);

        let rawRouteId = trip ? trip.route_id : null;
        if (!rawRouteId && entity.vehicle.trip?.routeId) {
          rawRouteId = regionPrefix + entity.vehicle.trip.routeId;
        }

        const route = routes.find(r => r.route_id === rawRouteId);

        tempPositions.push({
          vehicle_id: entity.vehicle.vehicle?.id,
          trip_id: fullTripId,
          route_id: rawRouteId,
          lat: entity.vehicle.position?.latitude,
          lon: entity.vehicle.position?.longitude,
          bearing: entity.vehicle.position?.bearing,
          speed: entity.vehicle.position?.speed,
          timestamp: entity.vehicle.timestamp,
          route_short_name: route ? route.short_name : '?',
          trip_headsign: trip ? trip.trip_headsign : '?',
          color: route ? route.color : '000000',
          text_color: route ? route.text_color : 'FFFFFF'
        });
      }

      if (entity.tripUpdate) {
        const tripId = regionPrefix + entity.tripUpdate.trip.tripId;
        if (!tempUpdates[tripId]) tempUpdates[tripId] = {};
        if (entity.tripUpdate.stopTimeUpdate) {
          entity.tripUpdate.stopTimeUpdate.forEach(stu => {
            const stopId = regionPrefix + stu.stopId;
            const arrival = stu.arrival?.time;
            const delay = stu.arrival?.delay;
            tempUpdates[tripId][stopId] = {
              arrival_time: arrival ? (arrival.low || arrival) : null,
              delay: delay
            };
          });
        }
      }
    });
    console.log(`✓ ${regionPrefix} fetched successfully.`);
    return true; // Success
  } catch (error) {
    const status = error.response ? error.response.status : 'Network Error';
    console.error(`X Error fetching ${regionPrefix}: Status ${status}`);
    if (status === 439) return 'RATE_LIMIT';
    return false; // General failure
  }
}

async function fetchData() {
  const tempPositions = [];
  const tempUpdates = {};
  let hitRateLimit = false;

  const feeds = [
    { url: 'https://opendata.cyprusbus.transport.services/api/gtfs-realtime/Emel_Lemesos_GTFS-Realtime', prefix: 'emel_' },
    { url: 'https://opendata.cyprusbus.transport.services/api/gtfs-realtime/Intercity_Buses_GTFS-Realtime', prefix: 'intercity_buses_' },
    { url: 'https://opendata.cyprusbus.transport.services/api/gtfs-realtime/LPT_Larnaca_GTFS-Realtime', prefix: 'lpt_' },
    { url: 'https://opendata.cyprusbus.transport.services/api/gtfs-realtime/OsyPa_Paphos_GTFS-Realtime', prefix: 'osypa_pafos_' },
    { url: 'https://opendata.cyprusbus.transport.services/api/gtfs-realtime/OSEA_Famagusta_GTFS-Realtime', prefix: 'osea__famagusta__' },
    { url: 'https://opendata.cyprusbus.transport.services/api/gtfs-realtime/CPT_Lefkosia_GTFS-Realtime', prefix: 'npt_' }
  ];

  console.log("\n--- Starting Fetch Cycle ---");

  for (const feed of feeds) {
    if (hitRateLimit) {
      console.log(`Skipping ${feed.prefix} due to Rate Limit.`);
      continue;
    }

    const result = await processFeed(feed.url, feed.prefix, tempPositions, tempUpdates);

    if (result === 'RATE_LIMIT') {
      hitRateLimit = true;
      console.log("!!! RATE LIMIT HIT (439) !!! Pausing fetch for 60 seconds...");
    } else {
      // Wait 5 seconds between requests to be "Polite"
      await new Promise(r => setTimeout(r, 5000));
    }
  }

  if (tempPositions.length > 0) {
    vehiclePositions = tempPositions;
    tripUpdates = tempUpdates;
    console.log(`>>> Updated: ${vehiclePositions.length} active buses found.`);
  } else {
    console.log(">>> Cycle finished. No buses found.");
  }

  // If we hit a rate limit, wait 2 minutes. Otherwise, wait 45 seconds.
  const nextDelay = hitRateLimit ? 120000 : 45000;
  console.log(`Next update in ${nextDelay / 1000} seconds...`);
  setTimeout(fetchData, nextDelay);
}

async function loadData() {
  console.log("Starting Smart Data Load...");
  const TODAY = getCyprusDate();
  console.log(`Filtering for Date: ${TODAY}`);

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
    await processCSV(path.join(dir, 'calendar_dates.txt'), (row) => {
      if (row.date === TODAY && row.exception_type === '1') {
        activeServices.add(regionPrefix + row.service_id);
      }
    });

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
        short_name: row.route_short_name,
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
  // Start the first fetch immediately
  fetchData();
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

app.get('/api/vehicle_positions', (req, res) => res.json(vehiclePositions));

app.listen(PORT, () => console.log(`Backend running on port ${PORT}`));
