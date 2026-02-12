import { pgTable, text, serial, integer, real, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const metrics = pgTable("metrics", {
  id: serial("id").primaryKey(),
  ts: timestamp("ts").defaultNow(),
  mint: text("mint").notNull(),
  holders: integer("holders").notNull(),
  whaleNetFlow: real("whale_net_flow").notNull(),
  nciRaw: real("nci_raw").notNull(),
  nciEma: real("nci_ema").notNull(),
  band: text("band").notNull(),
  posture: text("posture").notNull(),
});

export const whaleState = pgTable("whale_state", {
  owner: text("owner").primaryKey(),
  lastSig: text("last_sig"),
});

export const insertMetricSchema = createInsertSchema(metrics).omit({ id: true, ts: true });
export const insertWhaleStateSchema = createInsertSchema(whaleState);

export type Metric = typeof metrics.$inferSelect;
export type InsertMetric = z.infer<typeof insertMetricSchema>;
export type WhaleState = typeof whaleState.$inferSelect;
export type InsertWhaleState = z.infer<typeof insertWhaleStateSchema>;
