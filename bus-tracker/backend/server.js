const express = require('express');
const cors = require('cors');
const fs = require('fs');
const csv = require('csv-parser');
const path = require('path');
const axios = require('axios');
const GtfsRealtimeBindings = require('gtfs-realtime-bindings');

const app = express();
const PORT = process.env.PORT || 3001;

// --- VERSION CHECK LOG ---
console.log("--- SERVER VERSION: MEMORY OPTIMIZED V3 (STREAMING) ---");

app.use(cors());
app.use(express.json());

const DATA_DIR = path.join(__dirname, 'data/gtfs');
const GTFS_RT_URL = process.env.GTFS_RT_URL;

// --- Global Data Stores ---
// Optimized for low memory usage
let stops = [];
let routes = [];
let trips = [];
let stopTimetable = {}; // Optimized: { stop_id: [ { trip_id, arrival_time } ] }
let routeStops = {};    // route_id -> Set(stop_ids)
let shapes = {};        // shape_id -> [[lat, lon]]
let routeShapes = {};   // route_id -> Set(shape_id)
let calendarDates = {}; // date -> Set(service_id)
let vehiclePositions = [];
let tripUpdates = {};

// --- Memory Efficient CSV Processor ---
// This reads the file line-by-line instead of loading the whole file into RAM.
function processCSV(filePath, onRow) {
  return new Promise((resolve, reject) => {
    if (!fs.existsSync(filePath)) {
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
        try {
          onRow(data);
        } catch (err) {
          // Ignore bad rows to prevent crashes
        }
      })
      .on('end', resolve)
      .on('error', (err) => {
        console.warn(`Warning processing ${filePath}: ${err.message}`);
        resolve(); // Continue even on error
      });
  });
}

// Sequential Realtime Processing
async function processFeed(url, regionPrefix, tempPositions, tempUpdates) {
  try {
    const response = await axios.get(url, {
      responseType: 'arraybuffer',
      timeout: 10000 // 10s timeout
    });
    const feed = GtfsRealtimeBindings.transit_realtime.FeedMessage.decode(new Uint8Array(response.data));

    feed.entity.forEach(entity => {
      if (entity.vehicle) {
        const rawTripId = entity.vehicle.trip?.tripId;
        const fullTripId = regionPrefix + rawTripId;
        const trip = trips.find(t => t.trip_id === fullTripId); // Note: Array.find is slow on large arrays, but acceptable for RT updates (hundreds of buses)

        // Fallback for route ID
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
            const delay = stu.arrival?.delay; // delay is in seconds

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
  // console.log('--- Starting RT Update ---');
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
    // console.log(`RT Update Complete. Active buses: ${vehiclePositions.length}`);
  } catch (error) {
    console.error('RT Update failed:', error);
  }
}

async function loadData() {
  console.log("Starting Optimized Data Load...");

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
  stopTimetable = {}; // Reset object
  routeStops = {};
  shapes = {};
  routeShapes = {};
  calendarDates = {};

  for (const dir of dataDirs) {
    const regionPrefix = path.basename(dir).replace(/[^a-zA-Z0-9]/g, '_').toLowerCase() + '_';
    console.log(`Streaming ${path.basename(dir)}...`);

    // 1. STOPS (Store in array)
    const stopsFile = fs.existsSync(path.join(dir, 'stops.txt')) ? 'stops.txt' : 'stops.csv';
    const stopsSet = new Set(); // Prevent duplicates per region
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

    // 2. ROUTES
    await processCSV(path.join(dir, 'routes.txt'), (row) => {
      routes.push({
        route_id: regionPrefix + row.route_id,
        short_name: row.route_short_name,
        long_name: row.route_long_name,
        color: row.route_color,
        text_color: row.route_text_color
      });
    });

    // 3. TRIPS & Build Region Lookup
    // We build a temporary Map for this region to link stop_times -> routes efficiently
    // This Map is discarded after the region loop to save memory.
    const regionTripToRoute = new Map();

    await processCSV(path.join(dir, 'trips.txt'), (row) => {
      const fullTripId = regionPrefix + row.trip_id;
      const fullRouteId = regionPrefix + row.route_id;
      const fullShapeId = row.shape_id ? regionPrefix + row.shape_id : null;

      trips.push({
        trip_id: fullTripId,
        route_id: fullRouteId,
        service_id: regionPrefix + row.service_id,
        trip_headsign: row.trip_headsign,
        shape_id: fullShapeId
      });

      // Store mapping for this region only
      regionTripToRoute.set(fullTripId, fullRouteId);

      // Link Shape to Route
      if (fullShapeId) {
        if (!routeShapes[fullRouteId]) routeShapes[fullRouteId] = new Set();
        routeShapes[fullRouteId].add(fullShapeId);
      }
    });

    // 4. STOP TIMES (Stream & Organize by Stop ID)
    // CRITICAL: We do NOT store a giant stopTimes array. We bucket by stop_id immediately.
    await processCSV(path.join(dir, 'stop_times.txt'), (row) => {
      const fullTripId = regionPrefix + row.trip_id;
      const fullStopId = regionPrefix + row.stop_id;
      const arrival = row.arrival_time;

      // A. Add to Timetable
      if (!stopTimetable[fullStopId]) {
        stopTimetable[fullStopId] = [];
      }
      // Minimal storage: Trip ID + Time. 
      // We don't store the full object to save RAM.
      stopTimetable[fullStopId].push({
        t: fullTripId,
        a: arrival
      });

      // B. Add to Route Stops (using the temporary map)
      const routeId = regionTripToRoute.get(fullTripId);
      if (routeId) {
        if (!routeStops[routeId]) routeStops[routeId] = new Set();
        routeStops[routeId].add(fullStopId);
      }
    });

    // 5. SHAPES (Stream & Sort)
    // We store temporarily to sort, then commit to global shapes
    const tempShapes = {}; // shape_id -> [{lat, lon, seq}]
    await processCSV(path.join(dir, 'shapes.txt'), (row) => {
      const shapeId = regionPrefix + row.shape_id;
      if (!tempShapes[shapeId]) tempShapes[shapeId] = [];
      tempShapes[shapeId].push({
        lat: parseFloat(row.shape_pt_lat),
        lon: parseFloat(row.shape_pt_lon),
        seq: parseInt(row.shape_pt_sequence)
      });
    });

    // Sort and flatten shapes to save memory
    Object.keys(tempShapes).forEach(sid => {
      const sorted = tempShapes[sid].sort((a, b) => a.seq - b.seq);
      shapes[sid] = sorted.map(pt => [pt.lat, pt.lon]); // Store only arrays of nums
    });

    // 6. CALENDAR
    await processCSV(path.join(dir, 'calendar_dates.txt'), (row) => {
      if (row.exception_type === '1') {
        const date = row.date;
        const serviceId = regionPrefix + row.service_id;
        if (!calendarDates[date]) calendarDates[date] = new Set();
        calendarDates[date].add(serviceId);
      }
    });

    // Force release of region specific temp variables (Garbage Collection Helper)
    regionTripToRoute.clear();

    // Tiny pause between regions to allow Node GC to breathe
    if (global.gc) global.gc(); // Hint if exposed
    await new Promise(r => setTimeout(r, 500));
  }

  console.log("Data Load Complete!");
  console.log(`Stops: ${stops.length}, Routes: ${routes.length}, Trips: ${trips.length}`);

  // Start polling
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

// Optimized Timetable Endpoint
app.get('/api/stops/:stopId/timetable', (req, res) => {
  const { stopId } = req.params;
  let { date } = req.query;

  if (!date) {
    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    date = `${yyyy}${mm}${dd}`;
  }

  let activeServices = calendarDates[date];
  if (!activeServices || activeServices.size === 0) {
    const allDates = Object.keys(calendarDates).sort();
    const nextDate = allDates.find(d => d > date) || allDates[0];
    if (nextDate) activeServices = calendarDates[nextDate];
  }

  // Get raw arrivals for this stop (Fast Lookup)
  const rawArrivals = stopTimetable[stopId] || [];

  // Filter and Expand
  const results = [];
  for (const item of rawArrivals) {
    const trip = trips.find(t => t.trip_id === item.t);

    // Filter by Service Date
    if (!trip || (activeServices && !activeServices.has(trip.service_id))) {
      continue;
    }

    const route = routes.find(r => r.route_id === trip.route_id);

    // Realtime Calculation
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
