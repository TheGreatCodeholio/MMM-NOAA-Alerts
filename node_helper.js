/* node_helper for MMM-NOAA-Alerts (debug) */
"use strict";

const NodeHelper = require("node_helper");
const fetch = require("node-fetch"); // v2.x (CommonJS)
const { DateTime } = require("luxon");

const SEV_RANK = { Unknown: 0, Minor: 1, Moderate: 2, Severe: 3, Extreme: 4 };

module.exports = NodeHelper.create({
  start() {
    this.timer = null;
    this.cfg = null;
    this.etag = null;
    this.lastPayload = [];
    console.log("[MMM-NOAA-Alerts] helper started");
  },

  stop() {
    if (this.timer) clearInterval(this.timer);
  },

  socketNotificationReceived(notification, payload) {
    if (notification === "NOAA_CONFIG") {
      this.cfg = Object.assign(
          {
            zones: [],
            updateInterval: 5 * 60 * 1000,
            userAgent: "MMM-NOAA-Alerts/1.0 (you@example.com)",
            minSeverity: "Minor",
            sortBy: "severity"
          },
          payload || {}
      );

      // Normalize zones (uppercase & trim)
      this.cfg.zones = (this.cfg.zones || [])
          .map((z) => String(z || "").trim().toUpperCase())
          .filter(Boolean);

      console.log("[MMM-NOAA-Alerts] config received:", this.cfg);

      if (this.timer) clearInterval(this.timer);
      this.fetchOnce().catch((e) => {
        console.error("[MMM-NOAA-Alerts] first fetch error:", e);
        // Send empty payload so the front-end at least becomes 'loaded'
        this.sendSocketNotification("NOAA_ALERTS", []);
      });
      this.timer = setInterval(() => {
        this.fetchOnce().catch((e) => console.error("[MMM-NOAA-Alerts] fetch error:", e));
      }, Math.max(60_000, Number(this.cfg.updateInterval) || 300_000));
    }
  },

  buildUrl() {
    const zones = (this.cfg.zones || []).join(",");
    const base = "https://api.weather.gov/alerts/active";
    // NOTE: API accepts SDC### (county) and SDZ### (zone) in the 'zone' filter.
    const qs = zones ? `?zone=${zones}` : ""; // don't encode commas; leave as CSV
    const url = base + qs;
    console.log("[MMM-NOAA-Alerts] request URL:", url);
    return url;
  },

  async fetchOnce() {
    if (!this.cfg || !Array.isArray(this.cfg.zones) || this.cfg.zones.length === 0) {
      console.warn("[MMM-NOAA-Alerts] no zones configured");
      this.sendSocketNotification("NOAA_ALERTS", []);
      return;
    }

    const url = this.buildUrl();
    const headers = {
      "User-Agent": this.cfg.userAgent || "MMM-NOAA-Alerts/1.0 (you@example.com)",
      Accept: "application/geo+json",
    };
    if (this.etag) headers["If-None-Match"] = this.etag;

    const res = await fetch(url, { headers, timeout: 20000 });
    console.log("[MMM-NOAA-Alerts] status:", res.status, res.statusText);

    if (res.status === 304) {
      console.log("[MMM-NOAA-Alerts] 304 Not Modified; returning lastPayload len =", this.lastPayload.length);
      this.sendSocketNotification("NOAA_ALERTS", this.lastPayload);
      return;
    }
    if (!res.ok) {
      console.error("[MMM-NOAA-Alerts] NWS API error:", res.status, res.statusText);
      this.sendSocketNotification("NOAA_ALERTS", this.lastPayload);
      return;
    }

    this.etag = res.headers.get("etag") || this.etag;
    const json = await res.json();
    const features = Array.isArray(json.features) ? json.features : [];
    console.log("[MMM-NOAA-Alerts] features raw count:", features.length);

    const now = DateTime.now();

    // Normalize
    let alerts = features.map((f) => {
      const p = f && f.properties ? f.properties : {};
      const expiresISO = p.expires || p.ends || null;
      const expiresLocal = expiresISO
          ? DateTime.fromISO(expiresISO).toLocal().toLocaleString(DateTime.DATETIME_SHORT)
          : null;

      return {
        id: f.id || p.id || p["@id"] || null,
        event: p.event || "",
        headline: p.headline || "",
        severity: p.severity || "Unknown",
        urgency: p.urgency || "",
        certainty: p.certainty || "",
        areaDesc: p.areaDesc || "",
        effective: p.effective || p.onset || null,
        expires: expiresISO,
        expiresLocal,
        senderName: p.senderName || "",
        description: (p.instruction ? `${p.description || ""}\n${p.instruction}` : (p.description || "")).trim(),
      };
    });

    console.log("[MMM-NOAA-Alerts] after normalize count:", alerts.length);

    // Filter by min severity
    const minSevRank = SEV_RANK[this.cfg.minSeverity] ?? 1;
    alerts = alerts.filter((a) => (SEV_RANK[a.severity] ?? 0) >= minSevRank);
    console.log("[MMM-NOAA-Alerts] after severity filter (", this.cfg.minSeverity, ") count:", alerts.length);

    // Filter out obviously expired items
    const beforeExpiry = alerts.length;
    alerts = alerts.filter((a) => {
      if (!a.expires) return true;
      try {
        return DateTime.fromISO(a.expires) > now.minus({ minutes: 1 });
      } catch {
        return true;
      }
    });
    console.log("[MMM-NOAA-Alerts] after expiry filter (dropped", beforeExpiry - alerts.length, ") count:", alerts.length);

    // Sort
    if (this.cfg.sortBy === "expires") {
      alerts.sort((a, b) => (a.expires || "").localeCompare(b.expires || ""));
    } else {
      alerts.sort((a, b) => (SEV_RANK[b.severity] ?? 0) - (SEV_RANK[a.severity] ?? 0));
    }

    // Show a preview of what we’ll send
    console.log(
        "[MMM-NOAA-Alerts] sending",
        alerts.length,
        "alerts",
        alerts.slice(0, 3).map((a) => `${a.event} (${a.severity}) -> ${a.areaDesc}`).join(" | ")
    );

    this.lastPayload = alerts;
    this.sendSocketNotification("NOAA_ALERTS", alerts);
  },

  log(msg) {
    console.log(`[MMM-NOAA-Alerts] ${msg}`);
  },
});
