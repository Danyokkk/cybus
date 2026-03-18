import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const getVehicles = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("vehicle_positions").collect();
  },
});

export const updatePositions = mutation({
  args: {
    updates: v.array(v.object({
      vehicle_id: v.string(),
      lat: v.number(),
      lon: v.number(),
      bearing: v.optional(v.number()),
      route_short_name: v.optional(v.string()),
      route_id: v.optional(v.string()),
      color: v.optional(v.string()),
      speed: v.optional(v.number()),
      headsign: v.optional(v.string()),
      agency: v.optional(v.string()),
    })),
  },
  handler: async (ctx, { updates }) => {
    const now = Date.now();
    for (const update of updates) {
      const existing = await ctx.db
        .query("vehicle_positions")
        .withIndex("by_vehicle", (q) => q.eq("vehicle_id", update.vehicle_id))
        .unique();

      if (existing) {
        await ctx.db.patch(existing._id, { ...update, last_update: now });
      } else {
        await ctx.db.insert("vehicle_positions", { ...update, last_update: now });
      }
    }

    // Optional: cleanup old positions (older than 10 mins)
    const oldOnes = await ctx.db
      .query("vehicle_positions")
      .filter((q) => q.lt(q.field("last_update"), now - 10 * 60000))
      .collect();
    for (const old of oldOnes) {
      await ctx.db.delete(old._id);
    }
  },
});
