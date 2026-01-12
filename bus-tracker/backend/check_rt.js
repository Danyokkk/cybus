const axios = require('axios');
const GtfsRealtimeBindings = require('gtfs-realtime-bindings');

const GTFS_RT_URL = 'http://motionbuscard.org.cy:8328/Api/api/gtfs-realtime';

async function checkFeed() {
    try {
        console.log('Fetching GTFS-RT...');
        const response = await axios.get(GTFS_RT_URL, {
            responseType: 'arraybuffer'
        });
        const feed = GtfsRealtimeBindings.transit_realtime.FeedMessage.decode(new Uint8Array(response.data));

        let vehicleCount = 0;
        let tripUpdateCount = 0;
        let otherCount = 0;

        feed.entity.forEach(entity => {
            if (entity.vehicle) vehicleCount++;
            else if (entity.tripUpdate) tripUpdateCount++;
            else otherCount++;
        });

        console.log(`Entities found:`);
        console.log(`- VehiclePositions: ${vehicleCount}`);
        console.log(`- TripUpdates: ${tripUpdateCount}`);
        console.log(`- Other: ${otherCount}`);

        if (tripUpdateCount > 0) {
            console.log('Sample TripUpdate:', JSON.stringify(feed.entity.find(e => e.tripUpdate).tripUpdate, null, 2));
        }

    } catch (error) {
        console.error('Error:', error.message);
    }
}

checkFeed();
