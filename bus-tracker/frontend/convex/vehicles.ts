import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const getVehicles = query({
  args: {},
  handler: async (ctx) => {
    // Return all current vehicle positions, ordered by ID or default for speed
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

    // 1. SELF-HEALING: Clean out all stale or corrupted data FIRST
    // Remove anything older than 2 minutes via index
    const stale = await ctx.db
      .query("vehicle_positions")
      .withIndex("by_last_update", (q) => q.lt("last_update", now - 120000))
      .collect();
    for (const s of stale) await ctx.db.delete(s._id);

    // 2. SCHEMA GUARD: Nuke any data missing last_update (prevents schema validation 'Server Error')
    // We only run this on small batches or if we see corruption
    const corrupted = await ctx.db
      .query("vehicle_positions")
      .filter((q) => q.eq(q.field("last_update"), undefined))
      .collect();
    for (const c of corrupted) await ctx.db.delete(c._id);

    // 3. Batch Update new positions
    for (const update of updates) {
      if (!update.vehicle_id) continue;
      
      const existing = await ctx.db
        .query("vehicle_positions")
        .withIndex("by_vehicle", (q) => q.eq("vehicle_id", update.vehicle_id))
        .first();

      if (existing) {
        await ctx.db.patch(existing._id, { ...update, last_update: now });
      } else {
        await ctx.db.insert("vehicle_positions", { ...update, last_update: now });
      }
    }
  },
});
