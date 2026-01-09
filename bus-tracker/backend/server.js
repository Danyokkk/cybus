const express = require('express');
const cors = require('cors');
const fs = require('fs');
const csv = require('csv-parser');
const path = require('path');
const axios = require('axios');
const https = require('https'); // Required for SSL fix
const GtfsRealtimeBindings = require('gtfs-realtime-bindings');

const app = express();
const PORT = process.env.PORT || 3001;

// --- VERSION CHECK LOG ---
console.log("--- SERVER VERSION: V4 (TODAY-ONLY FILTER + SSL FIX) ---");

app.use(cors());
app.use(express.json());

const DATA_DIR = path.join(__dirname, 'data/gtfs');
const GTFS_RT_URL = process.env.GTFS_RT_URL;

// --- Global Data Stores ---
let stops = [];
let routes = [];
let trips = [];
let stopTimetable = {}; // { stop_id: [ { t: trip_id, a: arrival_time } ] }
let routeStops = {};    // route_id -> Set(stop_ids)
let shapes = {};        // shape_id -> [[lat, lon]]
let routeShapes = {};   // route_id -> Set(shape_id)
let vehiclePositions = [];
let tripUpdates = {};

// Fix for SSL Error (Cyprus Open Data strictness)
const axiosInstance = axios.create({
  httpsAgent: new https.Agent({
    rejectUnauthorized: false, // Bypass strict SSL certificate checks
    secureOptions: require('constants').SSL_OP_LEGACY_SERVER_CONNECT
  }),
  headers: {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
  }
});

// Helper: Get Current Date in YYYYMMDD (Cyprus Time)
function getCyprusDate() {
  const now = new Date();
  // Adjust to Cyprus time (UTC+2/3) - simplified approach
  now.setHours(now.getHours() + 2);
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  return `${yyyy}${mm}${dd}`;
}

// Memory Efficient CSV Processor
function processCSV(filePath, onRow) {
  return new Promise((resolve, reject) => {
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
      .on('error', (err) => {
        console.warn(`Warning processing ${filePath}: ${err.message}`);
        resolve();
      });
  });
}

// Realtime Fetcher with SSL Fix
async function processFeed(url, regionPrefix, tempPositions, tempUpdates) {
  try {
    const response = await axiosInstance.get(url, {
      responseType: 'arraybuffer',
      timeout: 15000
    });
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
  } catch (error) {
    console.error(`Error fetching ${regionPrefix}:`, error.message);
  }
}

async function fetchData() {
  const tempPositions = [];
  const tempUpdates = {};
  try {
    await processFeed('https://opendata.cyprusbus.transport.services/api/gtfs-realtime/Emel_Lemesos_GTFS-Realtime', 'emel_', tempPositions, tempUpdates);
    await new Promise(r => setTimeout(r, 1000));
    await processFeed('https://opendata.cyprusbus.transport.services/api/gtfs-realtime/Intercity_Buses_GTFS-Realtime', 'intercity_buses_', tempPositions, tempUpdates);
    await new Promise(r => setTimeout(r, 1000));
    await processFeed('https://opendata.cyprusbus.transport.services/api/gtfs-realtime/LPT_Larnaca_GTFS-Realtime', 'lpt_', tempPositions, tempUpdates);
    await new Promise(r => setTimeout(r, 1000));
    await processFeed('https://opendata.cyprusbus.transport.services/api/gtfs-realtime/OsyPa_Paphos_GTFS-Realtime', 'osypa_pafos_', tempPositions, tempUpdates);
    await new Promise(r => setTimeout(r, 1000));
    await processFeed('https://opendata.cyprusbus.transport.services/api/gtfs-realtime/OSEA_Famagusta_GTFS-Realtime', 'osea__famagusta__', tempPositions, tempUpdates);
    await new Promise(r => setTimeout(r, 1000));
    await processFeed('https://opendata.cyprusbus.transport.services/api/gtfs-realtime/CPT_Lefkosia_GTFS-Realtime', 'npt_', tempPositions, tempUpdates);

    vehiclePositions = tempPositions;
    tripUpdates = tempUpdates;
  } catch (error) {
    console.error('RT Update failed:', error);
  }
}

async function loadData() {
  console.log("Starting Smart Data Load (Today Only)...");

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

  // Reset stores
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

    // 1. Identify Active Services for TODAY
    const activeServices = new Set();
    await processCSV(path.join(dir, 'calendar_dates.txt'), (row) => {
      if (row.date === TODAY && row.exception_type === '1') {
        activeServices.add(regionPrefix + row.service_id);
      }
    });
    // Fallback: If no calendar_dates for today (rare), maybe check calendar.txt? 
    // For now, if activeServices is empty, we might load nothing for this region, saving RAM.

    // 2. Load Stops (Always load all stops so map works)
    const stopsFile = fs.existsSync(path.join(dir, 'stops.txt')) ? 'stops.txt' : 'stops.csv';
    const stopsSet = new Set();
    await processCSV(path.join(dir, stopsFile), (row) => {
      const id = row.stop_id || row.code;
      const name = row.stop_name || row['description[en]'] || row.description;
      const lat = row.stop_lat || row.lat;
      const lon = row.stop_lon || row.lon;
      if (id && lat && lon && !stopsSet.has(id)) {
        stopsSet.add(id);
        stops.push({
          stop_id: regionPrefix + id,
          name: name,
          lat: parseFloat(lat),
          lon: parseFloat(lon)
        });
      }
    });

    // 3. Load Routes
    await processCSV(path.join(dir, 'routes.txt'), (row) => {
      routes.push({
        route_id: regionPrefix + row.route_id,
        short_name: row.route_short_name,
        long_name: row.route_long_name,
        color: row.route_color,
        text_color: row.route_text_color
      });
    });

    // 4. Load Trips (ONLY if Service ID is active today)
    const regionTripToRoute = new Map();
    const activeTripsSet = new Set(); // Fast lookup

    await processCSV(path.join(dir, 'trips.txt'), (row) => {
      const fullServiceId = regionPrefix + row.service_id;

      // CRITICAL FILTER: Only load trips running TODAY
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

    // 5. Load Stop Times (ONLY if Trip is active today)
    await processCSV(path.join(dir, 'stop_times.txt'), (row) => {
      const fullTripId = regionPrefix + row.trip_id;

      // CRITICAL FILTER: Drop time if trip isn't running today
      if (activeTripsSet.has(fullTripId)) {
        const fullStopId = regionPrefix + row.stop_id;
        const arrival = row.arrival_time;

        if (!stopTimetable[fullStopId]) stopTimetable[fullStopId] = [];
        // Store minimal data
        stopTimetable[fullStopId].push({ t: fullTripId, a: arrival });

        // Link Stop to Route
        const routeId = regionTripToRoute.get(fullTripId);
        if (routeId) {
          if (!routeStops[routeId]) routeStops[routeId] = new Set();
          routeStops[routeId].add(fullStopId);
        }
      }
    });

    // 6. Load Shapes (Only load shapes used by active trips to save more RAM?)
    // Actually, let's load all shapes for map completeness, shapes are usually small compared to times.
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

    // Cleanup for this region
    regionTripToRoute.clear();
    activeTripsSet.clear();
    if (global.gc) global.gc();
    await new Promise(r => setTimeout(r, 200));
  }

  console.log("Smart Data Load Complete!");
  console.log(`Stops: ${stops.length}, Active Trips Today: ${trips.length}`);

  fetchData();
  setInterval(fetchData, 40000);
}

loadData();

// --- API ---

app.get('/api/stops', (req, res) => {
  res.json(stops);
});

app.get('/api/routes', (req, res) => {
  res.json(routes);
});

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
  // Since we only loaded TODAY's data, we ignore the date query param essentially.
  // We just return what we have in memory.

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

app.get('/api/vehicle_positions', (req, res) => {
  res.json(vehiclePositions);
});

app.listen(PORT, () => {
  console.log(`Backend running on port ${PORT}`);
});
