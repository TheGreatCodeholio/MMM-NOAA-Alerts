/* node_helper for MMM-NOAA-Alerts */
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

      if (this.timer) clearInterval(this.timer);
      this.fetchOnce().catch(() => {});
      this.timer = setInterval(() => {
        this.fetchOnce().catch((e) => this.log("Fetch error: " + e));
      }, Math.max(60_000, Number(this.cfg.updateInterval) || 300_000));
    }
  },

  buildUrl() {
    const zones = (this.cfg.zones || []).filter(Boolean).map(z => z.trim()).join(",");
    const base = "https://api.weather.gov/alerts/active";
    const qs = zones ? `?zone=${encodeURIComponent(zones)}` : "";
    return base + qs;
  },

  async fetchOnce() {
    if (!this.cfg || !Array.isArray(this.cfg.zones) || this.cfg.zones.length === 0) {
      this.sendSocketNotification("NOAA_ALERTS", []);
      return;
    }

    const url = this.buildUrl();
    const headers = {
      "User-Agent": this.cfg.userAgent || "MMM-NOAA-Alerts/1.0 (you@example.com)",
      "Accept": "application/geo+json"
    };
    if (this.etag) headers["If-None-Match"] = this.etag;

    const res = await fetch(url, { headers, timeout: 20000 });
    if (res.status === 304) {
      this.sendSocketNotification("NOAA_ALERTS", this.lastPayload);
      return;
    }
    if (!res.ok) {
      this.log(`NWS API ${res.status} ${res.statusText}`);
      this.sendSocketNotification("NOAA_ALERTS", this.lastPayload);
      return;
    }

    this.etag = res.headers.get("etag") || this.etag;
    const json = await res.json();
    const features = Array.isArray(json.features) ? json.features : [];
    const now = DateTime.now();

    let alerts = features.map(f => {
      const p = f && f.properties ? f.properties : {};
      const expiresISO = p.expires || p.ends || null;
      const expiresLocal = expiresISO
          ? DateTime.fromISO(expiresISO).toLocal().toLocaleString(DateTime.DATETIME_SHORT)
          : null;

      return {
        id: f.id || p.id || p['@id'] || null,   // <-- fixed invalid token here
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
        description: (p.instruction ? `${p.description || ""}\n${p.instruction}` : (p.description || "")).trim()
      };
    });

    const minSevRank = SEV_RANK[this.cfg.minSeverity] ?? 1;
    alerts = alerts.filter(a => (SEV_RANK[a.severity] ?? 0) >= minSevRank);

    alerts = alerts.filter(a => {
      if (!a.expires) return true;
      try { return DateTime.fromISO(a.expires) > now.minus({ minutes: 1 }); }
      catch { return true; }
    });

    if (this.cfg.sortBy === "expires") {
      alerts.sort((a, b) => (a.expires || "").localeCompare(b.expires || ""));
    } else {
      alerts.sort((a, b) => (SEV_RANK[b.severity] ?? 0) - (SEV_RANK[a.severity] ?? 0));
    }

    this.lastPayload = alerts;
    this.sendSocketNotification("NOAA_ALERTS", alerts);
  },

  log(msg) {
    console.log(`[MMM-NOAA-Alerts] ${msg}`);
  }
});
