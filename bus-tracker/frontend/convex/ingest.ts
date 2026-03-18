import { action } from "./_generated/server";
import { api } from "./_generated/api";
import GtfsRealtimeBindings from "gtfs-realtime-bindings";

export const pollBusData = action({
  args: {},
  handler: async (ctx) => {
    try {
      // CyBus GTFS-RT API
      const url = "http://20.19.98.194:8328/Api/api/gtfs-realtime";
      const response = await fetch(url);
      
      if (!response.ok) throw new Error("GTFS fetch failed");
      
      const buffer = await response.arrayBuffer();
      const feed = GtfsRealtimeBindings.transit_realtime.FeedMessage.decode(new Uint8Array(buffer));

      const updates: any[] = [];
      feed.entity.forEach((entity: any) => {
        if (entity.vehicle) {
          updates.push({
            vehicle_id: entity.vehicle.vehicle?.id || "unknown",
            lat: entity.vehicle.position?.latitude,
            lon: entity.vehicle.position?.longitude,
            bearing: entity.vehicle.position?.bearing,
            speed: entity.vehicle.position?.speed,
            route_id: entity.vehicle.trip?.routeId,
            // Header and colors will be matched on frontend for now
            // or we could enrich here if routes are in Convex
          });
        }
      });

      if (updates.length > 0) {
        await ctx.runMutation(api.vehicles.updatePositions, { updates });
        console.log(`Ingested ${updates.length} vehicles to Convex`);
      }
    } catch (err) {
      console.error("Poll error:", err);
    }
  },
});

export const pingRender = action({
  args: {},
  handler: async () => {
    try {
      // Pings Render to prevent it from ever sleeping (Free Tier 24/7 Uptime)
      await fetch("https://cyfinal.onrender.com/api/routes");
      console.log("Pinged Render to keep it awake!");
    } catch (e) {
      console.error("Ping failed", e);
    }
  },
});
