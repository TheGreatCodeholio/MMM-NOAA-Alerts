/* MagicMirror Module: MMM-NOAA-Alerts
 * Shows active NOAA/NWS alerts for configured UGC codes (e.g., SDZ013).
 * Hides itself when there are no alerts.
 */
Module.register("MMM-NOAA-Alerts", {
  defaults: {
    zones: [],                       // e.g., ["SDZ013","SDZ014"] (use Z* zones for advisories)
    updateInterval: 5 * 60 * 1000,   // 5 minutes
    userAgent: "MMM-NOAA-Alerts/1.0 (you@example.com)",
    showMultiple: true,              // show all, or only the most urgent if false
    minSeverity: "Minor",            // "Unknown","Minor","Moderate","Severe","Extreme"
    sortBy: "severity"               // "severity" or "expires"
  },

  requiresVersion: "2.1.0",

  start() {
    this.alerts = [];
    this.loaded = false;

    this.sendSocketNotification("NOAA_CONFIG", {
      zones: this.config.zones,
      updateInterval: this.config.updateInterval,
      userAgent: this.config.userAgent,
      minSeverity: this.config.minSeverity,
      sortBy: this.config.sortBy
    });
  },

  getStyles() {
    return ["MMM-NOAA-Alerts.css"];
  },

  getEventIcon(eventName = "") {
    const map = {
      "Tornado Warning": "🌪️",
      "Severe Thunderstorm Warning": "⛈️",
      "Flash Flood Warning": "🌊",
      "Flood Warning": "🌊",
      "Winter Storm Warning": "❄️",
      "Blizzard Warning": "🌨️",
      "High Wind Warning": "💨",
      "Red Flag Warning": "🔥",
      "Excessive Heat Warning": "🔥",
      "Heat Advisory": "🥵",
      "Wind Chill Warning": "🥶",
    };
    return map[eventName] || "⚠️";
  },

  socketNotificationReceived(notification, payload) {
    if (notification === "NOAA_ALERTS") {
      this.loaded = true;
      this.alerts = Array.isArray(payload) ? payload : [];
      if (!this.alerts.length) this.hide(0); else this.show(300);
      this.updateDom(300);
    }
  },

  sevClass(sev) {
    const s = (sev || "Unknown").toLowerCase();
    if (s === "extreme") return "sev-extreme";
    if (s === "severe")  return "sev-severe";
    if (s === "moderate")return "sev-moderate";
    if (s === "minor")   return "sev-minor";
    return "sev-unknown";
  },

  getDom() {
    const wrapper = document.createElement("div");
    wrapper.className = "noaa-wrapper";
    if (!this.loaded || !this.alerts.length) return wrapper;

    const alerts = this.config.showMultiple ? this.alerts : [this.alerts[0]];
    alerts.forEach(a => {
      const card = document.createElement("div");
      card.className = `noaa-alert ${this.sevClass(a.severity)}`;

      const icon = document.createElement("div");
      icon.className = "noaa-icon";
      icon.textContent = this.getEventIcon(a.event);

      const body = document.createElement("div");
      body.className = "noaa-body";

      const title = document.createElement("div");
      title.className = "noaa-title";
      title.textContent = a.headline || a.event || "Weather Alert";

      const meta = document.createElement("div");
      meta.className = "noaa-meta";
      const where = a.areaDesc ? ` • ${a.areaDesc}` : "";
      const until = a.expiresLocal ? ` • until ${a.expiresLocal}` : "";
      meta.textContent = `${a.severity}${where}${until}`;

      if (a.description) {
        const desc = document.createElement("div");
        desc.className = "noaa-desc";
        desc.textContent = a.description;
        body.appendChild(desc);
      }

      body.prepend(meta);
      body.prepend(title);
      card.appendChild(icon);
      card.appendChild(body);
      wrapper.appendChild(card);
    });

    return wrapper;
  }
});
