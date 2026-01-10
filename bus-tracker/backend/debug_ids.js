const axios = require('axios');
const GtfsRealtimeBindings = require('gtfs-realtime-bindings');

async function debug() {
    const res = await axios.get('http://20.19.98.194:8328/Api/api/gtfs-realtime', { responseType: 'arraybuffer' });
    const feed = GtfsRealtimeBindings.transit_realtime.FeedMessage.decode(new Uint8Array(res.data));
    const vehicles = feed.entity.filter(e => e.vehicle);
    console.log(`Found ${vehicles.length} vehicles out of ${feed.entity.length} entities.`);
    vehicles.slice(0, 10).forEach((v, i) => {
        console.log(`V${i}: Trip="${v.vehicle.trip.tripId}" Route="${v.vehicle.trip.routeId}"`);
    });
}
debug();
