import protobuf from 'protobufjs';

// Minimal GTFS-Realtime proto definition to avoid large file loading
const protoJSON = {
    nested: {
        transit_realtime: {
            nested: {
                FeedMessage: {
                    fields: {
                        header: { id: 1, type: "FeedHeader" },
                        entity: { rule: "repeated", id: 2, type: "FeedEntity" }
                    }
                },
                FeedHeader: {
                    fields: {
                        gtfs_realtime_version: { rule: "required", id: 1, type: "string" },
                        incrementality: { id: 2, type: "Incrementality", defaultValue: 0 },
                        timestamp: { id: 3, type: "uint64" }
                    },
                    nested: {
                        Incrementality: {
                            values: { FULL_DATASET: 0, DIFFERENTIAL: 1 }
                        }
                    }
                },
                FeedEntity: {
                    fields: {
                        id: { rule: "required", id: 1, type: "string" },
                        is_deleted: { id: 3, type: "bool", defaultValue: false },
                        trip_update: { id: 4, type: "TripUpdate" },
                        vehicle: { id: 5, type: "VehiclePosition" }
                    }
                },
                TripUpdate: {
                    fields: {
                        trip: { rule: "required", id: 1, type: "TripDescriptor" },
                        stop_time_update: { rule: "repeated", id: 2, type: "StopTimeUpdate" },
                        timestamp: { id: 4, type: "uint64" }
                    }
                },
                StopTimeUpdate: {
                    fields: {
                        stop_sequence: { id: 1, type: "uint32" },
                        stop_id: { id: 4, type: "string" },
                        arrival: { id: 2, type: "StopTimeEvent" },
                        departure: { id: 3, type: "StopTimeEvent" }
                    }
                },
                StopTimeEvent: {
                    fields: {
                        delay: { id: 1, type: "int32" },
                        time: { id: 2, type: "int64" },
                        uncertainty: { id: 3, type: "int32" }
                    }
                },
                VehiclePosition: {
                    fields: {
                        trip: { id: 1, type: "TripDescriptor" },
                        vehicle: { id: 8, type: "VehicleDescriptor" },
                        position: { id: 2, type: "Position" },
                        timestamp: { id: 4, type: "uint64" }
                    }
                },
                TripDescriptor: {
                    fields: {
                        trip_id: { id: 1, type: "string" },
                        route_id: { id: 5, type: "string" }
                    }
                },
                VehicleDescriptor: {
                    fields: {
                        id: { id: 1, type: "string" },
                        label: { id: 2, type: "string" }
                    }
                },
                Position: {
                    fields: {
                        latitude: { rule: "required", id: 1, type: "float" },
                        longitude: { rule: "required", id: 2, type: "float" },
                        bearing: { id: 3, type: "float" },
                        odometer: { id: 4, type: "double" },
                        speed: { id: 5, type: "float" }
                    }
                }
            }
        }
    }
};

const root = protobuf.Root.fromJSON(protoJSON);
const FeedMessage = root.lookupType("transit_realtime.FeedMessage");

const FEEDS = [
    { url: 'https://opendata.cyprusbus.transport.services/api/gtfs-realtime/Emel_Lemesos_GTFS-Realtime', prefix: 'emel_' },
    { url: 'https://opendata.cyprusbus.transport.services/api/gtfs-realtime/Intercity_Buses_GTFS-Realtime', prefix: 'intercity_buses_' },
    { url: 'https://opendata.cyprusbus.transport.services/api/gtfs-realtime/LPT_Larnaca_GTFS-Realtime', prefix: 'lpt_' },
    { url: 'https://opendata.cyprusbus.transport.services/api/gtfs-realtime/OsyPa_Paphos_GTFS-Realtime', prefix: 'osypa_pafos_' },
    { url: 'https://opendata.cyprusbus.transport.services/api/gtfs-realtime/OSEA_Famagusta_GTFS-Realtime', prefix: 'osea__famagusta__' },
    { url: 'https://opendata.cyprusbus.transport.services/api/gtfs-realtime/CPT_Lefkosia_GTFS-Realtime', prefix: 'npt_' }
];

// CORS Proxy - AllOrigins is generally stable for client-side
const CORS_PROXY = "https://api.allorigins.win/raw?url=";

export async function fetchAllRealtimeData(staticData) {
    const allPositions = [];
    const allUpdates = {};

    for (const feed of FEEDS) {
        try {
            const response = await fetch(CORS_PROXY + encodeURIComponent(feed.url));
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);

            const buffer = await response.arrayBuffer();
            const message = FeedMessage.decode(new Uint8Array(buffer));
            const object = FeedMessage.toObject(message, { longs: String, enums: String, bytes: String });

            if (object.entity) {
                object.entity.forEach(entity => {
                    if (entity.vehicle) {
                        const rawTripId = entity.vehicle.trip?.tripId;
                        const fullTripId = feed.prefix + rawTripId;

                        // Find static trip info
                        const trip = staticData.trips?.find(t => t.trip_id === fullTripId);
                        let rawRouteId = trip ? trip.route_id : null;
                        if (!rawRouteId && entity.vehicle.trip?.routeId) {
                            rawRouteId = feed.prefix + entity.vehicle.trip.routeId;
                        }

                        const route = staticData.routes?.find(r => r.route_id === rawRouteId);

                        allPositions.push({
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
                        const tripId = feed.prefix + entity.tripUpdate.trip.tripId;
                        if (!allUpdates[tripId]) allUpdates[tripId] = {};
                        if (entity.tripUpdate.stopTimeUpdate) {
                            entity.tripUpdate.stopTimeUpdate.forEach(stu => {
                                const stopId = feed.prefix + stu.stopId;
                                const arrival = stu.arrival?.time;
                                allUpdates[tripId][stopId] = {
                                    arrival_time: arrival,
                                    delay: stu.arrival?.delay
                                };
                            });
                        }
                    }
                });
            }
        } catch (err) {
            console.error(`Error fetching ${feed.prefix}:`, err);
        }
    }

    return { positions: allPositions, updates: allUpdates };
}
