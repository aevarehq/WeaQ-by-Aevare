
# WeaQ by Aevare

**Environmental Intelligence, Simplified.**

WeaQ is an open source environmental intelligence framework by Aevare. It combines live weather data, air quality monitoring, hazard classification, rainwater acidity estimation, and AI-powered analysis into one clean, minimal interface — built for anyone, deployable anywhere.

---

## What WeaQ Shows

- **Live Weather** — temperature, feels like, humidity, wind, UV index, pressure, visibility, precipitation
- **14-Day Forecast** — expandable day view with hourly temperature chart
- **Hazard Classification** — automatic severity rating across storm, heat, frost, rain and wind conditions
- **Air Quality Index** — EPA-calculated US AQI with PM2.5 and PM10 readings
- **Rainwater Acidity** — estimated pH derived from NO2 and CO concentrations
- **Verity Analysis** — AI-generated conditions summary, meteorological analysis, and daily suggestions powered by Gemini

---

## Getting Started

WeaQ requires two free API keys. You only enter them once — WeaQ remembers them.

**1. WeatherAPI** — live weather and AQI data

Sign up free at [weatherapi.com/signup](https://weatherapi.com/signup)

**2. Google Gemini** — Verity AI analysis

Get your free key at [aistudio.google.com/apikey](https://aistudio.google.com/apikey)

Once you have both keys, open WeaQ and enter them on the intro screen. That's it.

---

## Running Locally

No build step, no dependencies, no server required. Just clone and open.

```bash
git clone https://github.com/aevarehq/WeaQ-by-Aevare
cd WeaQ-by-Aevare
open index.html
```

---

## Data Sources

| Data | Source |
|------|--------|
| Weather and AQI | [WeatherAPI](https://weatherapi.com) |
| AI Analysis | [Google Gemini](https://aistudio.google.com) |
| Geocoding | [OpenStreetMap Nominatim](https://nominatim.org) |

---

## Notes

- AQI values are model-based. Accuracy may vary by region.
- API keys are stored in your browser's localStorage only. Never shared or transmitted anywhere except the respective API providers.
- WeaQ is a framework — self-host it, fork it, build on it.

---

## Built By

[Aevare](https://aevare.com) · [@aevarehq](https://instagram.com/aevarehq)

---

## License

MIT © Aevare 2026
```

---
