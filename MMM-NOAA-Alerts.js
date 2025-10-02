/* MagicMirror Module: MMM-NOAA-Alerts
 * Shows active NOAA/NWS alerts for configured UGC forecast zone codes (e.g., PAZ024)
 * Only displays when there are alerts; hides itself when none.
 */
Module.register("MMM-NOAA-Alerts", {
  defaults: {
    zones: [],                 // e.g., ["PAZ024", "NYZ024"]
    updateInterval: 5 * 60 * 1000, // 5 minutes
    userAgent: "MMM-NOAA-Alerts/1.0 (your-email@example.com)",
    showMultiple: true,        // If true, render all active alerts; otherwise only the most urgent one
    minSeverity: "Minor",      // One of: "Unknown","Minor","Moderate","Severe","Extreme"
    sortBy: "severity"         // "severity" or "expires"
  },

  requiresVersion: "2.1.0",

  start () {
    this.alerts = [];
    this.loaded = false;

    // Tell helper to start fetching
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

  // Map of common event -> icon (emoji keeps it lightweight)
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

      if (!this.alerts.length) {
        // Hide completely if no alerts
        this.hide(0);
      } else {
        this.show(300);
      }
      this.updateDom(300);
    }
  },

  // Severity -> CSS class (color) mapping
  sevClass(sev) {
    const s = (sev || "Unknown").toLowerCase();
    if (s === "extreme") return "sev-extreme";
    if (s === "severe")  return "sev-severe";
    if (s === "moderate")return "sev-moderate";
    if (s === "minor")   return "sev-minor";
    return "sev-unknown";
  },

  // Render DOM
  getDom() {
    const wrapper = document.createElement("div");
    wrapper.className = "noaa-wrapper";

    if (!this.loaded || !this.alerts.length) {
      // Nothing to show -> keep empty
      return wrapper;
    }

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

      const desc = document.createElement("div");
      desc.className = "noaa-desc";
      desc.textContent = a.description || "";

      body.appendChild(title);
      body.appendChild(meta);
      if (a.description) body.appendChild(desc);

      card.appendChild(icon);
      card.appendChild(body);
      wrapper.appendChild(card);
    });

    return wrapper;
  }
});
