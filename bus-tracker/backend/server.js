const express = require('express');
const cors = require('cors');
const fs = require('fs');
const csv = require('csv-parser');
const path = require('path');
const axios = require('axios');
const GtfsRealtimeBindings = require('gtfs-realtime-bindings');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

const DATA_DIR = path.join(__dirname, 'data/gtfs');
const GTFS_RT_URL = process.env.GTFS_RT_URL || 'http://motionbuscard.org.cy:8328/Api/api/gtfs-realtime';

let stops = [];
let routes = [];
let trips = []; // route_id -> [trip_ids]
let stopTimes = []; // trip_id -> [stop_ids]
let routeStops = {}; // route_id -> Set(stop_ids)
let shapes = {}; // shape_id -> [{lat, lon}]
let routeShapes = {}; // route_id -> Set(shape_id)
let calendarDates = {}; // date (YYYYMMDD) -> Set(service_id)
let vehiclePositions = []; // In-memory store for live buses
let tripUpdates = {}; // trip_id -> { stop_id -> { arrival, delay } }

// Helper to read CSV
function readCSV(filename) {
  return new Promise((resolve, reject) => {
    const results = [];
    fs.createReadStream(path.join(DATA_DIR, filename))
      .pipe(csv({
        mapHeaders: ({ header, index }) => {
          if (index === 0) {
            return header.replace(/^\ufeff/, '').trim();
          }
          return header.trim();
        }
      }))
      .on('data', (data) => results.push(data))
      .on('end', () => resolve(results))
      .on('error', (err) => reject(err));
  });
}

// Special helper for stops.csv (semicolon separator)
function readStopsCSV() {
  return new Promise((resolve, reject) => {
    const stopsMap = new Map();
    fs.createReadStream(path.join(DATA_DIR, 'stops.csv'))
      .pipe(csv({ separator: ';' }))
      .on('data', (row) => {
        if (row.lat && row.lon && row.code) {
          // Only add if not already exists (or overwrite, doesn't matter much if data is same)
          if (!stopsMap.has(row.code)) {
            stopsMap.set(row.code, {
              stop_id: row.code,
              name: row['description[en]'] || row.description,
              lat: parseFloat(row.lat),
              lon: parseFloat(row.lon)
            });
          }
        }
      })
      .on('end', () => resolve(Array.from(stopsMap.values())))
      .on('error', (err) => reject(err));
  });
}

// Sequential Processing Helper
async function processFeed(url, regionPrefix, tempPositions, tempUpdates) {
  try {
    const response = await axios.get(url, {
      responseType: 'arraybuffer',
      timeout: 15000 // Higher timeout for slow feeds
    });
    const feed = GtfsRealtimeBindings.transit_realtime.FeedMessage.decode(new Uint8Array(response.data));

    feed.entity.forEach(entity => {
      // Process Vehicle Positions
      if (entity.vehicle) {
        const rawTripId = entity.vehicle.trip?.tripId;
        const fullTripId = regionPrefix + rawTripId;
        const trip = trips.find(t => t.trip_id === fullTripId);

        const rawRouteId = trip ? trip.route_id : (entity.vehicle.trip?.routeId ? regionPrefix + entity.vehicle.trip.routeId : null);
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
          route_long_name: route ? route.long_name : '?',
          trip_headsign: trip ? trip.trip_headsign : '?',
          color: route ? route.color : '000000',
          text_color: route ? route.text_color : 'FFFFFF'
        });
      }

      // Process Trip Updates (ETA)
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

// ✅ Safe Mode version (fetches one by one for memory stability)
async function fetchData() {
  console.log('--- Starting Update Cycle ---');
  const tempPositions = [];
  const tempUpdates = {};

  try {
    // 1. EMEL
    console.log('Fetching EMEL...');
    await processFeed('https://opendata.cyprusbus.transport.services/api/gtfs-realtime/Emel_Lemesos_GTFS-Realtime', 'emel_', tempPositions, tempUpdates);

    // 2. Intercity (Wait 2 seconds to let memory cool down)
    await new Promise(resolve => setTimeout(resolve, 2000));
    console.log('Fetching Intercity...');
    await processFeed('https://opendata.cyprusbus.transport.services/api/gtfs-realtime/Intercity_Buses_GTFS-Realtime', 'intercity_buses_', tempPositions, tempUpdates);

    // 3. LPT
    await new Promise(resolve => setTimeout(resolve, 2000));
    console.log('Fetching LPT...');
    await processFeed('https://opendata.cyprusbus.transport.services/api/gtfs-realtime/LPT_Larnaca_GTFS-Realtime', 'lpt_', tempPositions, tempUpdates);

    // 4. Paphos (OsyPa)
    await new Promise(resolve => setTimeout(resolve, 2000));
    console.log('Fetching Paphos...');
    await processFeed('https://opendata.cyprusbus.transport.services/api/gtfs-realtime/OsyPa_Paphos_GTFS-Realtime', 'osypa_pafos_', tempPositions, tempUpdates);

    // 5. Famagusta (OSEA)
    await new Promise(resolve => setTimeout(resolve, 2000));
    console.log('Fetching OSEA...');
    await processFeed('https://opendata.cyprusbus.transport.services/api/gtfs-realtime/OSEA_Famagusta_GTFS-Realtime', 'osea__famagusta__', tempPositions, tempUpdates);

    // 6. Nicosia (CPT) - Usually the biggest, do it last
    await new Promise(resolve => setTimeout(resolve, 2000));
    console.log('Fetching Nicosia...');
    await processFeed('https://opendata.cyprusbus.transport.services/api/gtfs-realtime/CPT_Lefkosia_GTFS-Realtime', 'npt_', tempPositions, tempUpdates);

    // Atomically update global stores
    vehiclePositions = tempPositions;
    tripUpdates = tempUpdates;
    console.log('--- Update Cycle Complete ---');

  } catch (error) {
    console.error('Error in update cycle:', error);
  }
}

async function loadData() {
  try {
    console.log("Loading GTFS data from multiple regions...");

    // Define all source directories
    const dataDirs = [
      path.join(__dirname, 'data/other_gtfs/EMEL'), // Moved here
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
    stopTimes = [];
    calendarDates = {};
    routeStops = {};
    routeShapes = {};
    shapes = {};

    // Temporary storage for shape points before grouping
    let allShapePoints = [];

    // Helper to read CSV from a specific dir
    const readDirCSV = (dir, file, opts) => {
      const filePath = path.join(dir, file);
      if (!fs.existsSync(filePath)) return Promise.resolve([]);
      return new Promise((resolve, reject) => {
        const results = [];
        fs.createReadStream(filePath)
          .pipe(csv(opts || {
            mapHeaders: ({ header, index }) => {
              if (index === 0) return header.replace(/^\ufeff/, '').trim();
              return header.trim();
            }
          }))
          .on('data', (data) => results.push(data))
          .on('end', () => resolve(results))
          .on('error', (err) => resolve([])); // Resolve empty on error to not break all
      });
    };

    for (const dir of dataDirs) {
      // Create a prefix from the directory name, e.g., "osypa_pafos_"
      const regionPrefix = path.basename(dir).replace(/[^a-zA-Z0-9]/g, '_').toLowerCase() + '_';
      console.log(`Fetching ${path.basename(dir)} static data...`);

      // 1. Stops
      let regionStops = [];
      const stopsMap = new Map(); // Deduplicate within region

      // Sequential static load (already sequential loop, just added logs)
      if (fs.existsSync(path.join(dir, 'stops.txt'))) {
        const rawStops = await readDirCSV(dir, 'stops.txt');
        rawStops.forEach(s => {
          if (!stopsMap.has(s.stop_id)) {
            stopsMap.set(s.stop_id, {
              stop_id: regionPrefix + s.stop_id,
              name: s.stop_name,
              lat: parseFloat(s.stop_lat),
              lon: parseFloat(s.stop_lon)
            });
          }
        });
        regionStops = Array.from(stopsMap.values());
      } else if (fs.existsSync(path.join(dir, 'stops.csv'))) {
        // Fallback to stops.csv only if stops.txt is missing
        await new Promise((resolve) => {
          fs.createReadStream(path.join(dir, 'stops.csv'))
            .pipe(csv({ separator: ';' }))
            .on('data', (row) => {
              if (row.lat && row.lon && row.code) {
                if (!stopsMap.has(row.code)) {
                  stopsMap.set(row.code, {
                    stop_id: regionPrefix + row.code,
                    name: row['description[en]'] || row.description,
                    lat: parseFloat(row.lat),
                    lon: parseFloat(row.lon)
                  });
                }
              }
            })
            .on('end', () => resolve())
            .on('error', () => resolve());
        });
        regionStops = Array.from(stopsMap.values());
      }
      stops = stops.concat(regionStops);

      // Add small delay between static regions to let GC work
      await new Promise(r => setTimeout(r, 1000));

      // 2. Routes
      const rawRoutes = await readDirCSV(dir, 'routes.txt');
      const regionRoutes = rawRoutes.map(r => ({
        route_id: regionPrefix + r.route_id,
        short_name: r.route_short_name,
        long_name: r.route_long_name,
        color: r.route_color,
        text_color: r.route_text_color
      }));
      routes = routes.concat(regionRoutes);

      // 3. Trips
      const regionTrips = await readDirCSV(dir, 'trips.txt');
      const processedTrips = regionTrips.map(t => ({
        trip_id: regionPrefix + t.trip_id,
        route_id: regionPrefix + t.route_id,
        service_id: regionPrefix + t.service_id,
        trip_headsign: t.trip_headsign,
        shape_id: t.shape_id ? regionPrefix + t.shape_id : null
      }));
      trips = trips.concat(processedTrips);

      // 4. Stop Times
      const regionStopTimes = await readDirCSV(dir, 'stop_times.txt');
      // Only keep necessary fields to save memory
      const processedStopTimes = regionStopTimes.map(st => ({
        trip_id: regionPrefix + st.trip_id,
        stop_id: regionPrefix + st.stop_id,
        arrival_time: st.arrival_time
      }));
      stopTimes = stopTimes.concat(processedStopTimes);

      // 5. Shapes
      const regionShapes = await readDirCSV(dir, 'shapes.txt');
      const processedShapes = regionShapes.map(s => ({
        shape_id: regionPrefix + s.shape_id,
        shape_pt_lat: s.shape_pt_lat,
        shape_pt_lon: s.shape_pt_lon,
        shape_pt_sequence: s.shape_pt_sequence
      }));
      allShapePoints = allShapePoints.concat(processedShapes);

      // 6. Calendar Dates
      const regionCalendar = await readDirCSV(dir, 'calendar_dates.txt');
      regionCalendar.forEach(cd => {
        if (cd.exception_type === '1') {
          const dateKey = cd.date;
          const serviceId = regionPrefix + cd.service_id;
          if (!calendarDates[dateKey]) calendarDates[dateKey] = new Set();
          calendarDates[dateKey].add(serviceId);
        }
      });
    }

    console.log(`Total Stops: ${stops.length}`);
    console.log(`Total Routes: ${routes.length}`);
    console.log(`Total Trips: ${trips.length}`);

    // Process Shapes
    console.log("Processing Global Shapes...");
    const shapesMap = {};
    allShapePoints.forEach(pt => {
      const id = pt.shape_id;
      if (!shapesMap[id]) shapesMap[id] = [];
      shapesMap[id].push({
        lat: parseFloat(pt.shape_pt_lat),
        lon: parseFloat(pt.shape_pt_lon),
        seq: parseInt(pt.shape_pt_sequence)
      });
    });
    Object.keys(shapesMap).forEach(id => {
      shapes[id] = shapesMap[id]
        .sort((a, b) => a.seq - b.seq)
        .map(p => [p.lat, p.lon]);
    });

    // Build Relations
    console.log("Building Global Relations...");
    const tripToRouteMap = {};
    trips.forEach(t => tripToRouteMap[t.trip_id] = t.route_id);
    const stopIds = new Set(stops.map(s => s.stop_id));

    trips.forEach(t => {
      if (t.route_id && t.shape_id) {
        if (!routeShapes[t.route_id]) routeShapes[t.route_id] = new Set();
        routeShapes[t.route_id].add(t.shape_id);
      }
    });

    stopTimes.forEach(st => {
      const routeId = tripToRouteMap[st.trip_id];
      if (routeId && stopIds.has(st.stop_id)) {
        if (!routeStops[routeId]) routeStops[routeId] = new Set();
        routeStops[routeId].add(st.stop_id);
      }
    });

    console.log("All data loaded and merged!");

    // Start polling Realtime Data
    fetchData();
    setInterval(fetchData, 40000);

  } catch (error) {
    console.error("Error loading GTFS data:", error);
  }
}

// Start loading data
loadData();

// --- API Endpoints ---

// Get all stops
app.get('/api/stops', (req, res) => {
  res.json(stops);
});

// Get all routes
app.get('/api/routes', (req, res) => {
  res.json(routes);
});

// Get single route with its stops
app.get('/api/routes/:routeId', (req, res) => {
  const { routeId } = req.params;
  const route = routes.find(r => r.route_id === routeId);

  if (!route) {
    return res.status(404).json({ error: "Route not found" });
  }

  // Get stops for this route
  const stopIds = routeStops[routeId] ? Array.from(routeStops[routeId]) : [];
  const routeStopDetails = stopIds
    .map(id => stops.find(s => s.stop_id === id))
    .filter(Boolean);

  // Get shapes for this route
  const shapeIds = routeShapes[routeId] ? Array.from(routeShapes[routeId]) : [];
  const routeShapeDetails = shapeIds.map(id => shapes[id]).filter(Boolean);

  res.json({
    ...route,
    stops: routeStopDetails,
    shapes: routeShapeDetails
  });
});

// Get timetable for a stop (MERGED STATIC + REALTIME)
app.get('/api/stops/:stopId/timetable', (req, res) => {
  const { stopId } = req.params;
  let { date } = req.query; // YYYYMMDD

  if (!date) {
    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    date = `${yyyy}${mm}${dd}`;
  }

  let activeServices = calendarDates[date];

  // Fallback: If no services for today, find the next available date with services
  if (!activeServices || activeServices.size === 0) {
    // console.log(`No services for ${date}, looking for fallback...`);
    const allDates = Object.keys(calendarDates).sort();
    const nextDate = allDates.find(d => d > date) || allDates[0]; // Next future date or just the first available
    if (nextDate) {
      // console.log(`Using fallback date: ${nextDate}`);
      activeServices = calendarDates[nextDate];
    }
  }

  // If still no services (e.g. data empty), return all trips as last resort
  let activeTripIds = null;
  if (activeServices) {
    const activeTrips = trips.filter(t => activeServices.has(t.service_id));
    activeTripIds = new Set(activeTrips.map(t => t.trip_id));
  }

  const arrivals = stopTimes
    .filter(st => st.stop_id === stopId && (!activeTripIds || activeTripIds.has(st.trip_id)))
    .map(st => {
      const trip = trips.find(t => t.trip_id === st.trip_id);
      const route = routes.find(r => r.route_id === trip.route_id);

      // --- REALTIME MERGE START ---
      let arrivalTime = st.arrival_time;
      let isRealtime = false;
      let delay = 0;

      if (tripUpdates[st.trip_id] && tripUpdates[st.trip_id][stopId]) {
        const update = tripUpdates[st.trip_id][stopId];
        if (update.arrival_time) {
          // Convert Unix timestamp to HH:MM:SS (Cyprus time GMT+2/3)
          // Note: This is simplified. Ideally handle timezone properly.
          // Assuming feed is local time approx.
          const dateObj = new Date(update.arrival_time * 1000);
          // Force Cyprus TimeZone (approx fix for now) - simplified
          const timeStr = dateObj.toLocaleTimeString('en-GB', { hour12: false });
          arrivalTime = timeStr;
          isRealtime = true;
          delay = update.delay;
        }
      }
      // --- REALTIME MERGE END ---

      return {
        route_short_name: route ? route.short_name : '?',
        trip_headsign: trip.trip_headsign,
        route_id: route ? route.route_id : '?',
        arrival_time: arrivalTime,
        is_realtime: isRealtime,
        delay: delay
      };
    });

  arrivals.sort((a, b) => a.arrival_time.localeCompare(b.arrival_time));

  res.json(arrivals);
});

// Get live vehicles
app.get('/api/vehicle_positions', (req, res) => {
  res.json(vehiclePositions);
});

app.listen(PORT, () => {
  // console.log(`Backend running on http://localhost:${PORT}`);
  // console.log(`GTFS-RT URL: ${GTFS_RT_URL}`);
});
