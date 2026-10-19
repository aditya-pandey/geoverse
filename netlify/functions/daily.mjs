// Daily Bhoogol · how everyone did today
//
//   GET  /api/daily?n=142                         → { n, count, hist }
//   POST /api/daily  { n, score, device }         → { n, count, hist }
//
// hist[i] = how many players scored i × 5 (0 … 300 → 61 buckets).
// Nothing personal is kept: the device id is a random string the browser made up,
// and the network address is only ever stored as a salted hash, per day, for rate limiting.
import { getStore } from "@netlify/blobs";
import { handle } from "../daily-core.mjs";

export default async (req, context) => handle(req, getStore({ name: "daily-scores", consistency: "strong" }), context?.ip || "");

export const config = { path: "/api/daily" };
