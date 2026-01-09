const GtfsRealtimeBindings = require('gtfs-realtime-bindings');
const fs = require('fs');

const data = fs.readFileSync('global_rt.pb');
const feed = GtfsRealtimeBindings.transit_realtime.FeedMessage.decode(new Uint8Array(data));

console.log("Total entities:", feed.entity.length);
feed.entity.slice(0, 5).forEach(entity => {
    if (entity.vehicle) {
        console.log("Vehicle Trip ID:", entity.vehicle.trip.tripId, "Route ID:", entity.vehicle.trip.routeId);
    }
});
