const axios = require('axios');
const GtfsRealtimeBindings = require('gtfs-realtime-bindings');

async function check(id) {
    try {
        const res = await axios.get(`http://20.19.98.194:8328/Api/api/gtfs-realtime/${id}`, { responseType: 'arraybuffer' });
        const feed = GtfsRealtimeBindings.transit_realtime.FeedMessage.decode(new Uint8Array(res.data));
        console.log(`Operator ${id}: ${feed.entity.length} entities. Sample Trip ID: ${feed.entity[0]?.vehicle?.trip?.tripId || 'N/A'}`);
    } catch (err) { console.log(`Operator ${id} Error: ${err.message}`); }
}

async function run() {
    for (let i = 1; i <= 6; i++) await check(i);
}

run();
