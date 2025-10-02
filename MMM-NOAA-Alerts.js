/* MagicMirror Module: MMM-NOAA-Alerts
 * Compact stacked cards: icon + title + effective time ("until ...")
 * Hides itself when there are no alerts.
 */
Module.register("MMM-NOAA-Alerts", {
  defaults: {
    zones: [],                       // e.g., ["SDC013","SDC115","SDZ013"]
    updateInterval: 5 * 60 * 1000,   // 5 minutes
    userAgent: "MMM-NOAA-Alerts/1.0 (you@example.com)",
    showMultiple: true,              // show all; if false show only the top one
    maxCards: 4,                     // cap how many to render at once
    minSeverity: "Minor",            // "Unknown","Minor","Moderate","Severe","Extreme"
    sortBy: "severity",               // "severity" or "expires"
    stickToBottom: true
  },

  requiresVersion: "2.1.0",

  start() {
    this.alerts = [];
    this.loaded = false;

    this._dtFmt = new Intl.DateTimeFormat([], {
      dateStyle: "short",
      timeStyle: "short",
      timeZoneName: "short"
    });

    // Send once now (if socket is ready it goes through)...
    this._sendConfig();

    // ...and try again in a couple seconds in case sockets weren't ready yet.
    this._resendTimer = setTimeout(() => this._sendConfig(), 2500);
  },

  // When all modules are started, sockets are definitely up — send again.
  notificationReceived(notification) {
    if (notification === "ALL_MODULES_STARTED") {
      this._sendConfig();
    }
  },

  _sendConfig() {
    // Normalize & log for sanity
    const zones = (this.config.zones || []).map(z => String(z || "").trim().toUpperCase());
    // Optional debug log in the browser console:
    // console.log("[MMM-NOAA-Alerts] sending config", zones);

    this.sendSocketNotification("NOAA_CONFIG", {
      zones,
      updateInterval: this.config.updateInterval,
      userAgent: this.config.userAgent,
      minSeverity: this.config.minSeverity,
      sortBy: this.config.sortBy
    });
  },

  getStyles() { return ["MMM-NOAA-Alerts.css"]; },

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
      const count = Array.isArray(payload) ? payload.length : 0;
      /* eslint-disable no-undef */
      if (typeof Log !== "undefined" && Log.log) {
        Log.log(`[MMM-NOAA-Alerts] client received ${count} alert(s)`);
      }
      /* eslint-enable no-undef */

      this.loaded = true;
      this.alerts = Array.isArray(payload) ? payload : [];

      // For debugging, ensure we’re definitely visible, then render immediately.
      this.updateDom(0);
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

  _fmt(dtISO) {
    if (!dtISO) return null;
    const d = new Date(dtISO);
    if (isNaN(d)) return null;
    return this._dtFmt.format(d);
  },

  getDom() {
    const wrapper = document.createElement("div");
    wrapper.className = "noaa-stack";

    wrapper.setAttribute("data-alert-count", String(this.alerts?.length || 0));

    if (!this.loaded || !this.alerts.length) return wrapper;

    const src = this.config.showMultiple ? this.alerts : [this.alerts[0]];
    const alerts = src.slice(0, Math.max(1, this.config.maxCards || 1));

    alerts.forEach((a) => {
      const card = document.createElement("div");
      card.className = `noaa-card ${this.sevClass(a.severity)}`;

      const row = document.createElement("div");
      row.className = "noaa-row";

      const icon = document.createElement("div");
      icon.className = "noaa-icon";
      icon.textContent = this.getEventIcon(a.event);

      const title = document.createElement("div");
      title.className = "noaa-title";
      title.textContent = a.headline || a.event || "Weather Alert";

      row.appendChild(icon);
      row.appendChild(title);

      const eff = this._fmt(a.effective);
      const exp = this._fmt(a.expires);
      const time = document.createElement("div");
      time.className = "noaa-time";
      time.textContent = eff
          ? (exp ? `${eff} — until ${exp}` : `${eff} — until further notice`)
          : (exp ? `Until ${exp}` : "");

      card.appendChild(row);
      if (time.textContent) card.appendChild(time);
      wrapper.appendChild(card);
    });

    return wrapper;
  }
});
