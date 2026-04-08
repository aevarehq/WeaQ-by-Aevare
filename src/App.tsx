/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useCallback, ReactNode } from 'react';
import { GoogleGenAI } from "@google/genai";
import { 
  Search, 
  Wind, 
  Droplets, 
  Sun, 
  CloudRain, 
  AlertTriangle, 
  Activity, 
  Thermometer,
  ChevronDown,
  Loader2,
  Key,
  Eye,
  Gauge,
  Navigation,
  ExternalLink,
  Trash2,
  ArrowRight
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';

// --- Types ---

interface Location {
  name: string;
  region?: string;
  country: string;
  latitude: number;
  longitude: number;
}

interface WeatherAlert {
  headline: string;
  severity: string;
  urgency: string;
  areas: string;
  category: string;
  certainty: string;
  event: string;
  note: string;
  effective: string;
  expires: string;
  desc: string;
  instruction: string;
}

interface WeatherData {
  current: {
    temp: number;
    humidity: number;
    windSpeed: number;
    windDirection: string;
    windDegree: number;
    uvIndex: number;
    precipProb: number;
    precipMm: number;
    condition: string;
    conditionCode: number;
    icon: string;
    feelsLike: number;
    visibility: number;
    pressure: number;
  };
  daily: {
    time: string[];
    tempMax: number[];
    tempMin: number[];
    feelsLikeMax: number[];
    feelsLikeMin: number[];
    condition: string[];
    icon: string[];
    precipProb: number[];
    precipSum: number[];
    windSpeedMax: number[];
    windDirection: string[];
    humidityAvg: number[];
    uvIndexMax: number[];
    sunrise: string[];
    sunset: string[];
    hourly: {
      time: string;
      temp: number;
    }[][];
  };
  alerts: WeatherAlert[];
}

interface AirQualityData {
  aqi: number;
  pm2_5: number;
  pm10: number;
  no2: number;
  co: number;
  label: string;
  color: string;
}

interface HazardInfo {
  type: string;
  severity: 'Low' | 'Moderate' | 'High' | 'Extreme';
  color: string;
}

interface VerityAnalysis {
  conditions: string;
  analysis: string;
  suggestions: string;
}

// --- Constants & Helpers ---

const SYSTEM_PROMPT = `You are Verity, the analysis engine of WeaQ by Aevare. You receive live environmental data for a location and respond with exactly three sections: Conditions (one sentence summary of current state), Analysis (2-3 sentences on why these conditions are occurring, factual and meteorological), Suggestions (1-2 actionable things the person should know or do today). Be precise. Be minimal. No filler, no greetings, no sign-offs. Total response must stay under 120 words.`;

const getWindLabel = (speed: number) => {
  if (speed <= 5) return 'Calm';
  if (speed <= 19) return 'Light Breeze';
  if (speed <= 38) return 'Moderate';
  if (speed <= 61) return 'Strong';
  return 'Storm';
};

const getUVLabel = (uv: number) => {
  if (uv <= 2) return 'Low';
  if (uv <= 5) return 'Moderate';
  if (uv <= 7) return 'High';
  if (uv <= 10) return 'Very High';
  return 'Extreme';
};

const getHumidityLabel = (h: number) => {
  if (h <= 30) return 'Low';
  if (h <= 60) return 'Comfortable';
  if (h <= 80) return 'High';
  return 'Very High';
};

const getRainLabel = (amount: number) => {
  if (amount === 0) return 'None';
  if (amount <= 2) return 'Light';
  if (amount <= 10) return 'Moderate';
  if (amount <= 50) return 'Heavy';
  return 'Extreme';
};

const getPressureLabel = (p: number) => {
  if (p < 1000) return 'Low';
  if (p <= 1020) return 'Normal';
  return 'High';
};

const getVisibilityLabel = (v: number) => {
  if (v < 1) return 'Very Poor';
  if (v <= 4) return 'Poor';
  if (v <= 10) return 'Moderate';
  return 'Clear';
};

const getTempLabel = (temp: number) => {
  if (temp < 0) return 'Freezing';
  if (temp < 10) return 'Very Cold';
  if (temp < 18) return 'Cold';
  if (temp < 24) return 'Mild';
  if (temp < 30) return 'Warm';
  if (temp < 38) return 'Hot';
  return 'Scorching';
};

const getAQILabel = (aqi: number) => {
  if (aqi <= 50) return { label: 'Good', color: '#22c55e' };
  if (aqi <= 100) return { label: 'Moderate', color: '#eab308' };
  if (aqi <= 150) return { label: 'Unhealthy', color: '#f97316' };
  return { label: 'Hazardous', color: '#ef4444' };
};

const calculateAcidity = (no2: number, co: number) => {
  // Simplified calculation as requested: pH = 5.6 minus weighted pollution penalty
  // NO2 and CO are typically in µg/m³ or mg/m³. 
  // Let's assume a simple penalty based on these values.
  const penalty = (no2 * 0.005) + (co * 0.0001);
  const ph = Math.max(3.0, Math.min(5.6, 5.6 - penalty));
  
  let label = 'Normal';
  let color = '#22c55e';
  
  if (ph < 4.0) {
    label = 'Highly Acidic';
    color = '#ef4444';
  } else if (ph < 4.8) {
    label = 'Acidic';
    color = '#f97316';
  } else if (ph < 5.4) {
    label = 'Slightly Acidic';
    color = '#eab308';
  }
  
  return { ph: ph.toFixed(2), label, color };
};

const calculateUSAQI = (pm25: number) => {
  console.log('Raw PM2.5 for AQI calculation:', pm25);
  
  // Truncate PM2.5 to 1 decimal place as per user request
  const val = Math.floor(pm25 * 10) / 10;
  
  const breakpoints = [
    { pmLow: 0.0, pmHigh: 12.0, aqiLow: 0, aqiHigh: 50, label: 'Good', color: '#22c55e' },
    { pmLow: 12.1, pmHigh: 35.4, aqiLow: 51, aqiHigh: 100, label: 'Moderate', color: '#eab308' },
    { pmLow: 35.5, pmHigh: 55.4, aqiLow: 101, aqiHigh: 150, label: 'Unhealthy for Sensitive Groups', color: '#f97316' },
    { pmLow: 55.5, pmHigh: 150.4, aqiLow: 151, aqiHigh: 200, label: 'Unhealthy', color: '#ef4444' },
    { pmLow: 150.5, pmHigh: 250.4, aqiLow: 201, aqiHigh: 300, label: 'Very Unhealthy', color: '#7e22ce' },
    { pmLow: 250.5, pmHigh: 350.4, aqiLow: 301, aqiHigh: 400, label: 'Hazardous', color: '#7f1d1d' },
    { pmLow: 350.5, pmHigh: 500.4, aqiLow: 401, aqiHigh: 500, label: 'Hazardous', color: '#7f1d1d' }
  ];

  const bp = breakpoints.find(b => val >= b.pmLow && val <= b.pmHigh);
  
  if (!bp) {
    if (val > 500.4) {
      console.log('Calculated AQI (out of range): 500');
      return { aqi: 500, label: 'Hazardous', color: '#7f1d1d' };
    }
    console.log('Calculated AQI (no breakpoint found): 0');
    return { aqi: 0, label: 'Good', color: '#22c55e' };
  }

  const aqi = ((bp.aqiHigh - bp.aqiLow) / (bp.pmHigh - bp.pmLow)) * (val - bp.pmLow) + bp.aqiLow;
  const roundedAQI = Math.round(aqi);
  console.log('Calculated AQI:', roundedAQI, 'using breakpoint:', bp);
  return { aqi: roundedAQI, label: bp.label, color: bp.color };
};

const getHazardClassification = (weather: WeatherData): HazardInfo => {
  const { temp, windSpeed, conditionCode, precipProb } = weather.current;
  
  // Basic categorization logic
  if (temp > 38) return { type: 'Extreme Heat', severity: 'Extreme', color: '#ef4444' };
  if (temp > 32) return { type: 'Extreme Heat', severity: 'High', color: '#f97316' };
  
  if (temp < -5) return { type: 'Frost', severity: 'High', color: '#3b82f6' };
  if (temp < 2) return { type: 'Frost', severity: 'Moderate', color: '#60a5fa' };
  
  // WeatherAPI condition codes: https://www.weatherapi.com/docs/weather_conditions.json
  // 1273, 1276, 1279, 1282 are thunderstorms
  const isStorm = [1273, 1276, 1279, 1282, 1087].includes(conditionCode);
  const isHeavyRain = [1192, 1195, 1201, 1243, 1246].includes(conditionCode);

  if (isStorm) return { type: 'Storm Risk', severity: 'High', color: '#ef4444' };
  if (isHeavyRain) return { type: 'Heavy Rain', severity: 'High', color: '#3b82f6' };
  
  if (windSpeed > 60) return { type: 'High Wind', severity: 'Extreme', color: '#ef4444' };
  if (windSpeed > 40) return { type: 'High Wind', severity: 'High', color: '#f97316' };
  
  if (precipProb > 70) return { type: 'Heavy Rain', severity: 'Moderate', color: '#60a5fa' };
  
  return { type: 'Normal', severity: 'Low', color: '#22c55e' };
};

// --- Main Component ---

export default function App() {
  const [weatherKey, setWeatherKey] = useState<string>(() => localStorage.getItem('weaq_weather_key') || '');
  const [geminiKey, setGeminiKey] = useState<string>(() => localStorage.getItem('weaq_gemini_key') || '');
  const [onboarded, setOnboarded] = useState<boolean>(() => localStorage.getItem('weaq_onboarded') === 'true');
  const [searchQuery, setSearchQuery] = useState('');
  const [locations, setLocations] = useState<Location[]>([]);
  const [selectedLocation, setSelectedLocation] = useState<Location | null>(null);
  const [weather, setWeather] = useState<WeatherData | null>(null);
  const [airQuality, setAirQuality] = useState<AirQualityData | null>(null);
  const [analysis, setAnalysis] = useState<VerityAnalysis | null>(null);
  const [loading, setLoading] = useState(false);
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedDayIndex, setExpandedDayIndex] = useState<number | null>(null);

  useEffect(() => {
    if (weatherKey) localStorage.setItem('weaq_weather_key', weatherKey);
    if (geminiKey) localStorage.setItem('weaq_gemini_key', geminiKey);
  }, [weatherKey, geminiKey]);

  const forgetKeys = () => {
    localStorage.removeItem('weaq_weather_key');
    localStorage.removeItem('weaq_gemini_key');
    localStorage.removeItem('weaq_onboarded');
    setWeatherKey('');
    setGeminiKey('');
    setOnboarded(false);
  };

  const completeOnboarding = () => {
    if (weatherKey && geminiKey) {
      localStorage.setItem('weaq_onboarded', 'true');
      setOnboarded(true);
    }
  };

  // Debounced geocoding search as user types
  useEffect(() => {
    const timer = setTimeout(() => {
      if (searchQuery.length >= 2) {
        fetchGeocoding(searchQuery);
      } else {
        setLocations([]);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const fetchGeocoding = async (query: string) => {
    try {
      setError(null);
      const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&addressdetails=1&limit=15`;
      console.log('Nominatim API Call:', url);
      const res = await fetch(url, {
        headers: {
          'Accept-Language': 'en-US,en;q=0.9',
          'User-Agent': 'WeaQ-Applet'
        }
      });
      const data = await res.json();
      
      if (!data || data.length === 0) {
        setLocations([]);
        return;
      }

      const results: Location[] = data.map((r: any) => ({
        name: r.address.city || r.address.town || r.address.village || r.address.suburb || r.display_name.split(',')[0],
        region: r.address.state || r.address.region,
        country: r.address.country,
        latitude: parseFloat(r.lat),
        longitude: parseFloat(r.lon),
      })).sort((a: Location, b: Location) => a.name.localeCompare(b.name));

      setLocations(results);
    } catch (err) {
      console.error('Geocoding error:', err);
    }
  };

  const handleLocationSelect = async (loc: Location) => {
    setSelectedLocation(loc);
    setLocations([]);
    setSearchQuery('');
    setLoading(true);
    setAnalysis(null);
    setExpandedDayIndex(null);
    setError(null);
    
    try {
      if (!weatherKey) throw new Error('WeatherAPI key is missing.');

      const weatherUrl = `https://api.weatherapi.com/v1/forecast.json?key=${weatherKey}&q=${loc.latitude},${loc.longitude}&days=14&aqi=yes&alerts=yes&units=metric`;
      console.log('WeatherAPI Call:', weatherUrl);
      const res = await fetch(weatherUrl);
      
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error?.message || `WeatherAPI error: ${res.status}`);
      }
      
      const data = await res.json();
      console.log('Raw WeatherAPI Response:', data);
      
      const processedWeather: WeatherData = {
        current: {
          temp: data.current.temp_c,
          humidity: data.current.humidity,
          windSpeed: data.current.wind_kph,
          windDirection: data.current.wind_dir,
          windDegree: data.current.wind_degree,
          uvIndex: data.current.uv,
          precipProb: data.forecast.forecastday[0].day.daily_chance_of_rain, // WeatherAPI current doesn't have rain chance, keeping forecast for now but labeling clearly in UI if needed
          precipMm: data.current.precip_mm,
          condition: data.current.condition.text,
          conditionCode: data.current.condition.code,
          icon: data.current.condition.icon,
          feelsLike: data.current.feelslike_c,
          visibility: data.current.vis_km,
          pressure: data.current.pressure_mb,
        },
        daily: {
          time: data.forecast.forecastday.map((d: any) => d.date),
          tempMax: data.forecast.forecastday.map((d: any) => d.day.maxtemp_c),
          tempMin: data.forecast.forecastday.map((d: any) => d.day.mintemp_c),
          feelsLikeMax: data.forecast.forecastday.map((d: any) => d.day.maxtemp_c), // WeatherAPI doesn't provide daily feels like max/min directly in forecastday.day
          feelsLikeMin: data.forecast.forecastday.map((d: any) => d.day.mintemp_c),
          condition: data.forecast.forecastday.map((d: any) => d.day.condition.text),
          icon: data.forecast.forecastday.map((d: any) => d.day.condition.icon),
          precipProb: data.forecast.forecastday.map((d: any) => d.day.daily_chance_of_rain),
          precipSum: data.forecast.forecastday.map((d: any) => d.day.totalprecip_mm),
          windSpeedMax: data.forecast.forecastday.map((d: any) => d.day.maxwind_kph),
          windDirection: data.forecast.forecastday.map((d: any) => d.hour[12].wind_dir), // Approximate daily wind dir
          humidityAvg: data.forecast.forecastday.map((d: any) => d.day.avghumidity),
          uvIndexMax: data.forecast.forecastday.map((d: any) => d.day.uv),
          sunrise: data.forecast.forecastday.map((d: any) => d.astro.sunrise),
          sunset: data.forecast.forecastday.map((d: any) => d.astro.sunset),
          hourly: data.forecast.forecastday.map((d: any) => d.hour.map((h: any) => ({
            time: h.time,
            temp: h.temp_c
          })))
        },
        alerts: data.alerts.alert || []
      };
      setWeather(processedWeather);

      // Process Air Quality from WeatherAPI response
      if (data.current.air_quality) {
        const aq = data.current.air_quality;
        const pm25 = aq.pm2_5;
        const aqiResult = calculateUSAQI(pm25);

        setAirQuality({
          aqi: aqiResult.aqi,
          pm2_5: aq.pm2_5,
          pm10: aq.pm10,
          no2: aq.no2,
          co: aq.co,
          label: aqiResult.label,
          color: aqiResult.color
        });
      }

      setLoading(false);
      
      // Trigger Verity Analysis
      if (geminiKey) {
        runVerityAnalysis(loc, processedWeather, data.current.air_quality);
      }
    } catch (err) {
      console.error('Fetch error:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch environmental data.');
      setLoading(false);
    }
  };

  const runVerityAnalysis = async (loc: Location, w: WeatherData, aq: any) => {
    setAnalysisLoading(true);
    try {
      if (!geminiKey) return;
      const ai = new GoogleGenAI({ apiKey: geminiKey });
      
      // Calculate US AQI for the AI context
      const aqiResult = calculateUSAQI(aq?.pm2_5 || 0);
      
      const dataSummary = `
        Location: ${loc.name}, ${loc.country}
        Temperature: ${w.current.temp}°C
        Humidity: ${w.current.humidity}%
        Wind: ${w.current.windSpeed} km/h ${w.current.windDirection}
        UV Index: ${w.current.uvIndex}
        Precipitation: ${w.current.precipMm}mm (${w.current.precipProb}%)
        Condition: ${w.current.condition}
        AQI Data: US AQI: ${aqiResult.aqi} (${aqiResult.label}), PM2.5: ${aq?.pm2_5 || 'N/A'}, PM10: ${aq?.pm10 || 'N/A'}, NO2: ${aq?.no2 || 'N/A'}, CO: ${aq?.co || 'N/A'}
        Active Alerts: ${w.alerts.length > 0 ? w.alerts.map(a => a.headline).join('; ') : 'None'}
      `;

      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: [{ parts: [{ text: `Location: ${loc.name}. Data: ${dataSummary}` }] }],
        config: {
          systemInstruction: SYSTEM_PROMPT,
        }
      });

      const text = response.text || '';
      
      // Parse sections based on keywords with more robust regex
      const conditionsMatch = text.match(/Conditions:\s*([\s\S]*?)(?=Analysis:|Suggestions:|$)/i);
      const analysisMatch = text.match(/Analysis:\s*([\s\S]*?)(?=Suggestions:|Conditions:|$)/i);
      const suggestionsMatch = text.match(/Suggestions:\s*([\s\S]*?)(?=Analysis:|Conditions:|$)/i);

      const parsed: VerityAnalysis = {
        conditions: conditionsMatch ? conditionsMatch[1].trim() : '',
        analysis: analysisMatch ? analysisMatch[1].trim() : '',
        suggestions: suggestionsMatch ? suggestionsMatch[1].trim() : '',
      };

      // Fallback if parsing fails (e.g. model didn't use labels correctly)
      if (!parsed.conditions && text) {
        const parts = text.split('\n\n').filter(p => p.trim());
        parsed.conditions = parts[0] || '';
        parsed.analysis = parts[1] || '';
        parsed.suggestions = parts[2] || '';
      }

      setAnalysis(parsed);
    } catch (err) {
      console.error('Verity analysis failed:', err);
    } finally {
      setAnalysisLoading(false);
    }
  };

  const hazard = weather ? getHazardClassification(weather) : null;
  const acidity = airQuality ? calculateAcidity(airQuality.no2, airQuality.co) : null;

  return (
    <div className="min-h-screen p-4 md:p-8 max-w-4xl mx-auto flex flex-col gap-8">
      <AnimatePresence>
        {!onboarded && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.6 }}
            className="fixed inset-0 z-50 bg-black flex items-center justify-center p-6 text-center"
          >
            <div className="max-w-xl flex flex-col gap-8 items-center">
              <div className="flex flex-col items-center">
                <h1 
                  className="text-6xl font-jakarta font-bold tracking-[-0.5px] mb-2 animate-fade-up"
                  style={{ animationDuration: '0.8s' }}
                >
                  WEAQ
                </h1>
                <a 
                  href="https://aevare.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-secondary tracking-[2px] uppercase text-xs animate-fade-up font-jakarta font-bold hover:opacity-80 transition-opacity no-underline"
                  style={{ animationDelay: '0.5s' }}
                >
                  by Aevare
                </a>
              </div>

              <div 
                className="w-24 h-px bg-[#222222] animate-expand-horizontal"
                style={{ animationDelay: '1s' }}
              />

              <p 
                className="text-lg font-outfit font-medium animate-fade-up"
                style={{ animationDelay: '1.5s' }}
              >
                Environmental Intelligence, Simplified.
              </p>

              <p 
                className="text-secondary text-sm leading-relaxed animate-fade-up font-outfit font-normal"
                style={{ animationDelay: '2.2s' }}
              >
                WeaQ is an open source framework that brings together
                live weather, air quality, hazard classification, and
                AI-powered analysis into one minimal interface —
                built for anyone, deployable anywhere.
              </p>

              <div className="flex flex-col gap-6 w-full">
                <p 
                  className="text-xs text-secondary animate-fade-up font-outfit font-normal"
                  style={{ animationDelay: '3s' }}
                >
                  To get started, you'll need two free API keys.<br/>
                  WeaQ will remember them so you only do this once.
                </p>

                <div 
                  className="flex gap-4 justify-center animate-fade-up font-outfit font-medium"
                  style={{ animationDelay: '3.6s' }}
                >
                  <a href="https://www.weatherapi.com/signup.aspx" target="_blank" rel="noopener noreferrer" className="text-[10px] uppercase tracking-widest flex items-center gap-2 hover:text-white transition-colors">
                    Get WeatherAPI Key <ExternalLink className="w-3 h-3" />
                  </a>
                  <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noopener noreferrer" className="text-[10px] uppercase tracking-widest flex items-center gap-2 hover:text-white transition-colors">
                    Get Gemini API Key <ExternalLink className="w-3 h-3" />
                  </a>
                </div>

                <div 
                  className="flex flex-col gap-3 animate-fade-up"
                  style={{ animationDelay: '4.2s' }}
                >
                  <input 
                    type="password" 
                    placeholder="WeatherAPI Key" 
                    value={weatherKey}
                    onChange={(e) => setWeatherKey(e.target.value)}
                    className="w-full bg-[#111111] border border-[#222222] rounded-xl py-4 px-6 focus:outline-none focus:border-white transition-all text-sm"
                  />
                  <input 
                    type="password" 
                    placeholder="Gemini API Key" 
                    value={geminiKey}
                    onChange={(e) => setGeminiKey(e.target.value)}
                    className="w-full bg-[#111111] border border-[#222222] rounded-xl py-4 px-6 focus:outline-none focus:border-white transition-all text-sm"
                  />
                </div>

                <button 
                  onClick={completeOnboarding}
                  disabled={!weatherKey || !geminiKey}
                  className="btn-primary py-4 rounded-xl font-outfit font-medium flex items-center justify-center gap-2 disabled:opacity-30 animate-fade-up"
                  style={{ animationDelay: '4.8s' }}
                >
                  Enter your keys and continue <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Header */}
      <header className="flex justify-between items-end">
        <div>
          <h1 className="text-4xl font-jakarta font-bold tracking-[-0.5px]">WeaQ</h1>
          <a 
            href="https://aevare.com"
            target="_blank"
            rel="noopener noreferrer"
            className="text-secondary text-sm font-jakarta font-bold tracking-[2px] uppercase hover:opacity-80 transition-opacity no-underline"
          >
            by Aevare
          </a>
        </div>
        <div className="flex flex-col items-end gap-2">
          <div className="flex gap-2">
            <div className="relative group">
              <Key className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-secondary group-focus-within:text-white transition-colors" />
              <input 
                type="password" 
                placeholder="WeatherAPI Key" 
                value={weatherKey}
                onChange={(e) => setWeatherKey(e.target.value)}
                className="bg-[#111111] border border-[#222222] rounded-lg py-2 pl-10 pr-4 text-[10px] w-32 md:w-48 focus:outline-none focus:border-white transition-all"
              />
            </div>
            <div className="relative group">
              <Key className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-secondary group-focus-within:text-white transition-colors" />
              <input 
                type="password" 
                placeholder="Gemini API Key" 
                value={geminiKey}
                onChange={(e) => setGeminiKey(e.target.value)}
                className="bg-[#111111] border border-[#222222] rounded-lg py-2 pl-10 pr-4 text-[10px] w-32 md:w-48 focus:outline-none focus:border-white transition-all"
              />
            </div>
          </div>
          <button 
            onClick={forgetKeys}
            className="text-[9px] uppercase tracking-widest text-secondary hover:text-red-400 flex items-center gap-1 transition-colors"
          >
            <Trash2 className="w-3 h-3" /> Forget Keys
          </button>
        </div>
      </header>

      {/* Search */}
      <div className="flex flex-col gap-2">
        <form 
          onSubmit={(e) => { e.preventDefault(); fetchGeocoding(searchQuery); }}
          className="flex gap-2"
        >
          <div className="relative flex-1">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-secondary" />
            <input 
              type="text" 
              placeholder="Search city, town, or village..." 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-[#111111] border border-[#222222] rounded-xl py-4 pl-12 pr-4 focus:outline-none focus:border-white transition-all"
            />
          </div>
          <button 
            type="submit"
            disabled={loading}
            className="btn-primary px-8 font-medium disabled:opacity-50"
          >
            {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Search'}
          </button>
        </form>

        <AnimatePresence>
          {locations.length > 0 && (
            <motion.div 
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="card p-2 flex flex-col gap-1 z-10 max-h-[260px] overflow-y-auto no-scrollbar"
            >
              {locations.map((loc, i) => (
                <button 
                  key={i}
                  onClick={() => handleLocationSelect(loc)}
                  className="text-left p-3 hover:bg-[#222222] rounded-lg transition-colors flex justify-between items-center group"
                >
                  <span>{loc.name}, <span className="text-secondary">{loc.region ? `${loc.region}, ` : ''}{loc.country}</span></span>
                  <ChevronDown className="w-4 h-4 text-secondary -rotate-90 opacity-0 group-hover:opacity-100 transition-all" />
                </button>
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {error && (
        <div className="flex flex-col gap-2 px-2">
          <div className="text-red-500 text-sm">{error}</div>
          <button 
            onClick={() => selectedLocation && handleLocationSelect(selectedLocation)}
            className="text-xs text-secondary hover:text-white transition-colors text-left underline"
          >
            Retry last request
          </button>
        </div>
      )}

      {selectedLocation && (
        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="flex flex-col gap-8"
        >
          <div className="text-secondary text-sm px-2">
            Showing results for <span className="text-white font-medium">{selectedLocation.name}, {selectedLocation.region ? `${selectedLocation.region}, ` : ''}{selectedLocation.country}</span>
          </div>

          {/* Alerts Card */}
          {weather?.alerts && weather.alerts.length > 0 && (
            <div className="flex flex-col gap-4">
              {weather.alerts.map((alert, i) => (
                <div key={i} className="card p-6 border-red-500/20 bg-red-500/5">
                  <div className="flex justify-between items-start mb-4">
                    <div className="flex items-center gap-3">
                      <AlertTriangle className="w-6 h-6 text-red-500" />
                      <h2 className="text-lg font-bold text-red-500">{alert.event}</h2>
                    </div>
                    <Badge 
                      label={alert.severity || 'Moderate'} 
                      color={alert.severity?.toLowerCase().includes('severe') ? '#ef4444' : '#f97316'} 
                    />
                  </div>
                  <p className="text-sm font-medium mb-2">{alert.headline}</p>
                  <p className="text-xs text-secondary leading-relaxed line-clamp-3 hover:line-clamp-none transition-all cursor-pointer">
                    {alert.desc}
                  </p>
                </div>
              ))}
            </div>
          )}

          {/* Verity Analysis Card */}
          <div className="card p-6 border-white/10 relative overflow-hidden">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-lg font-jakarta font-bold tracking-[-0.5px] flex items-center gap-2">
                <Activity className="w-5 h-5" />
                VERITY ANALYSIS
              </h2>
              {analysisLoading && <Loader2 className="w-4 h-4 animate-spin text-secondary" />}
            </div>
            
            {!geminiKey && !analysis && (
              <div className="text-secondary text-sm italic font-outfit font-normal">
                Enter a Gemini API key to enable intelligence analysis.
              </div>
            )}

            {analysis && (
              <div className="flex flex-col gap-6">
                <div>
                  <h3 className="text-xs font-jakarta font-bold tracking-[2px] uppercase text-secondary mb-2">Conditions</h3>
                  <p className="text-sm leading-relaxed font-outfit font-normal">{analysis.conditions}</p>
                </div>
                <div>
                  <h3 className="text-xs font-jakarta font-bold tracking-[2px] uppercase text-secondary mb-2">Analysis</h3>
                  <p className="text-sm leading-relaxed font-outfit font-normal">{analysis.analysis}</p>
                </div>
                <div>
                  <h3 className="text-xs font-jakarta font-bold tracking-[2px] uppercase text-secondary mb-2">Suggestions</h3>
                  <p className="text-sm leading-relaxed font-outfit font-normal">{analysis.suggestions}</p>
                </div>
              </div>
            )}
            
            {analysisLoading && !analysis && (
              <div className="flex flex-col gap-4">
                <div className="h-4 bg-[#222222] rounded w-3/4 animate-pulse" />
                <div className="h-4 bg-[#222222] rounded w-full animate-pulse" />
                <div className="h-4 bg-[#222222] rounded w-1/2 animate-pulse" />
              </div>
            )}
          </div>

          {/* Current Stats Grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
            <StatCard 
              icon={<Thermometer />} 
              label="Temp" 
              value={`${Math.round(weather?.current.temp || 0)}°C — ${getTempLabel(weather?.current.temp || 0)}`} 
            />
            <StatCard 
              icon={<Thermometer className="text-blue-400" />} 
              label="Feels Like" 
              value={`${Math.round(weather?.current.feelsLike || 0)}°C — ${getTempLabel(weather?.current.feelsLike || 0)}`} 
            />
            <StatCard 
              icon={<Droplets />} 
              label="Humidity" 
              value={`${weather?.current.humidity}% — ${getHumidityLabel(weather?.current.humidity || 0)}`} 
            />
            <StatCard 
              icon={<Wind />} 
              label="Wind" 
              value={`${Math.round(weather?.current.windSpeed || 0)} km/h ${weather?.current.windDirection} — ${getWindLabel(weather?.current.windSpeed || 0)}`} 
            />
            <StatCard 
              icon={<Sun />} 
              label="UV Index" 
              value={`${weather?.current.uvIndex} — ${getUVLabel(weather?.current.uvIndex || 0)}`} 
            />
            <StatCard 
              icon={<CloudRain />} 
              label="Precipitation" 
              value={`${weather?.current.precipMm}mm — ${getRainLabel(weather?.current.precipMm || 0)}`} 
            />
            <StatCard 
              icon={<Eye />} 
              label="Visibility" 
              value={`${weather?.current.visibility} km — ${getVisibilityLabel(weather?.current.visibility || 0)}`} 
            />
            <StatCard 
              icon={<Gauge />} 
              label="Pressure" 
              value={`${weather?.current.pressure} hPa — ${getPressureLabel(weather?.current.pressure || 0)}`} 
            />
          </div>

          {/* Classification Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Hazard */}
            <div className="card p-6 flex flex-col gap-4">
              <h3 className="text-secondary text-xs font-jakarta font-bold tracking-[2px] uppercase">Hazard Classification</h3>
              <div className="flex items-center justify-between">
                <span className="text-xl font-outfit font-medium">{hazard?.type}</span>
                <Badge label={hazard?.severity || 'Low'} color={hazard?.color || '#22c55e'} />
              </div>
            </div>

            {/* AQI */}
            <div className="card p-6 flex flex-col gap-4">
              <h3 className="text-secondary text-xs font-jakarta font-bold tracking-[2px] uppercase">Air Quality</h3>
              {airQuality ? (
                <div className="flex flex-col gap-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xl font-outfit font-medium">AQI {airQuality.aqi} — {airQuality.label}</span>
                    <Badge label={airQuality.label} color={airQuality.color} />
                  </div>
                  <span className="text-[10px] text-[#666666] italic font-outfit font-normal -mt-1">
                    Model-based estimate. Ground readings may differ.
                  </span>
                  <div className="text-[10px] text-secondary flex gap-2 font-outfit font-normal mt-1">
                    <span>PM2.5: {airQuality.pm2_5}</span>
                    <span>PM10: {airQuality.pm10}</span>
                  </div>
                </div>
              ) : (
                <span className="text-secondary text-sm italic font-outfit font-normal">Air quality data unavailable for this region</span>
              )}
            </div>

            {/* Acidity */}
            <div className="card p-6 flex flex-col gap-4">
              <h3 className="text-secondary text-xs font-jakarta font-bold tracking-[2px] uppercase">Rainwater Acidity</h3>
              {acidity ? (
                <div className="flex items-center justify-between">
                  <span className="text-xl font-outfit font-medium">pH {acidity.ph} — {acidity.label}</span>
                  <Badge label={acidity.label} color={acidity.color} />
                </div>
              ) : (
                <span className="text-secondary text-sm italic font-outfit font-normal">Data unavailable</span>
              )}
            </div>
          </div>

          {/* 14-Day Forecast */}
          <div className="card p-6">
            <h3 className="text-secondary text-xs font-jakarta font-bold tracking-[2px] uppercase mb-6">14-Day Forecast</h3>
            <div className="flex overflow-x-auto gap-6 pb-4 no-scrollbar">
              {weather?.daily.time.map((time, i) => {
                return (
                  <button 
                    key={i} 
                    onClick={() => setExpandedDayIndex(expandedDayIndex === i ? null : i)}
                    className={`flex flex-col items-center gap-3 min-w-[100px] p-3 rounded-xl transition-all ${expandedDayIndex === i ? 'bg-[#222222]' : 'hover:bg-[#1a1a1a]'}`}
                  >
                    <span className="text-xs text-secondary font-jakarta font-bold tracking-[2px] uppercase">
                      {new Date(time).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    </span>
                    <img src={weather.daily.icon[i]} alt={weather.daily.condition[i]} className="w-8 h-8" referrerPolicy="no-referrer" />
                    <span className="text-[10px] text-secondary uppercase text-center leading-tight font-outfit font-normal">{weather.daily.condition[i]}</span>
                    <div className="flex flex-col items-center">
                      <span className="text-sm font-outfit font-medium">{Math.round(weather.daily.tempMax[i])}°</span>
                      <span className="text-xs text-secondary font-outfit font-normal">{Math.round(weather.daily.tempMin[i])}°</span>
                    </div>
                    <div className="flex items-center gap-1 text-[10px] text-blue-400 font-outfit font-normal">
                      <CloudRain className="w-2 h-2" />
                      <span>{weather.daily.precipProb[i]}%</span>
                    </div>
                  </button>
                );
              })}
            </div>

            <AnimatePresence>
              {expandedDayIndex !== null && weather && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="overflow-hidden border-t border-[#222222] mt-4 pt-6"
                >
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-6 mb-8">
                    <div className="flex flex-col gap-1">
                      <span className="text-[10px] font-jakarta font-bold tracking-[2px] uppercase text-secondary">Condition</span>
                      <div className="flex items-center gap-2">
                        <img src={weather.daily.icon[expandedDayIndex]} alt="" className="w-6 h-6" referrerPolicy="no-referrer" />
                        <span className="text-sm font-outfit font-medium">{weather.daily.condition[expandedDayIndex]}</span>
                      </div>
                    </div>
                    <div className="flex flex-col gap-1">
                      <span className="text-[10px] font-jakarta font-bold tracking-[2px] uppercase text-secondary">Temperature</span>
                      <span className="text-sm font-outfit font-medium">{Math.round(weather.daily.tempMax[expandedDayIndex])}° / {Math.round(weather.daily.tempMin[expandedDayIndex])}°</span>
                    </div>
                    <div className="flex flex-col gap-1">
                      <span className="text-[10px] font-jakarta font-bold tracking-[2px] uppercase text-secondary">Feels Like</span>
                      <span className="text-sm font-outfit font-medium">{Math.round(weather.daily.feelsLikeMax[expandedDayIndex])}° / {Math.round(weather.daily.feelsLikeMin[expandedDayIndex])}°</span>
                    </div>
                    <div className="flex flex-col gap-1">
                      <span className="text-[10px] font-jakarta font-bold tracking-[2px] uppercase text-secondary">Precipitation</span>
                      <span className="text-sm font-outfit font-medium">{weather.daily.precipProb[expandedDayIndex]}% — {weather.daily.precipSum[expandedDayIndex]}mm ({getRainLabel(weather.daily.precipSum[expandedDayIndex])})</span>
                    </div>
                    <div className="flex flex-col gap-1">
                      <span className="text-[10px] font-jakarta font-bold tracking-[2px] uppercase text-secondary">Wind</span>
                      <span className="text-sm font-outfit font-medium">{Math.round(weather.daily.windSpeedMax[expandedDayIndex])} km/h {weather.daily.windDirection[expandedDayIndex]} — {getWindLabel(weather.daily.windSpeedMax[expandedDayIndex])}</span>
                    </div>
                    <div className="flex flex-col gap-1">
                      <span className="text-[10px] font-jakarta font-bold tracking-[2px] uppercase text-secondary">Humidity Avg</span>
                      <span className="text-sm font-outfit font-medium">{Math.round(weather.daily.humidityAvg[expandedDayIndex])}% — {getHumidityLabel(weather.daily.humidityAvg[expandedDayIndex])}</span>
                    </div>
                    <div className="flex flex-col gap-1">
                      <span className="text-[10px] font-jakarta font-bold tracking-[2px] uppercase text-secondary">UV Index</span>
                      <span className="text-sm font-outfit font-medium">{weather.daily.uvIndexMax[expandedDayIndex]} — {getUVLabel(weather.daily.uvIndexMax[expandedDayIndex])}</span>
                    </div>
                    <div className="flex flex-col gap-1">
                      <span className="text-[10px] font-jakarta font-bold tracking-[2px] uppercase text-secondary">Sunrise / Sunset</span>
                      <span className="text-sm font-outfit font-medium">
                        {weather.daily.sunrise[expandedDayIndex]} / {weather.daily.sunset[expandedDayIndex]}
                      </span>
                    </div>
                  </div>

                  <div className="h-48 w-full">
                    <h4 className="text-[10px] font-jakarta font-bold tracking-[2px] uppercase text-secondary mb-4">Hourly Temperature</h4>
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={weather.daily.hourly[expandedDayIndex].map((h) => ({
                        time: new Date(h.time).getHours() + ':00',
                        temp: h.temp
                      }))}>
                        <XAxis dataKey="time" stroke="#444" fontSize={10} />
                        <YAxis stroke="#444" fontSize={10} />
                        <Tooltip 
                          contentStyle={{ backgroundColor: '#111', border: '1px solid #222', borderRadius: '8px' }}
                          itemStyle={{ color: '#fff' }}
                        />
                        <Line type="monotone" dataKey="temp" stroke="#fff" strokeWidth={2} dot={false} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </motion.div>
      )}

      <footer className="mt-auto pt-12 pb-8 flex flex-col items-center gap-4 border-t border-[#222222]">
        <div className="flex gap-4 text-[10px] font-jakarta font-bold tracking-[2px] uppercase text-secondary">
          <a 
            href="https://aevare.com" 
            target="_blank" 
            rel="noopener noreferrer" 
            className="hover:opacity-80 transition-opacity no-underline"
          >
            WeaQ by Aevare
          </a>
          <span>·</span>
          <a 
            href="https://aevare.com" 
            target="_blank" 
            rel="noopener noreferrer" 
            className="hover:opacity-80 transition-opacity no-underline"
          >
            aevare.com
          </a>
          <span>·</span>
          <a 
            href="https://instagram.com/aevarehq" 
            target="_blank" 
            rel="noopener noreferrer" 
            className="hover:opacity-80 transition-opacity no-underline"
          >
            @aevarehq
          </a>
        </div>
        <div className="text-[9px] text-secondary font-outfit font-normal">
          Data by WeatherAPI & Geocoding by OpenStreetMap
        </div>
      </footer>
    </div>
  );
}

// --- Sub-components ---

function StatCard({ icon, label, value }: { icon: ReactNode, label: string, value: string }) {
  return (
    <div className="card p-4 flex items-center gap-4">
      <div className="text-secondary shrink-0">{icon}</div>
      <div className="min-w-0">
        <p className="text-secondary text-[10px] font-outfit font-medium tracking-[2px] uppercase truncate">{label}</p>
        <p className="text-xs md:text-sm font-outfit font-normal leading-tight">{value}</p>
      </div>
    </div>
  );
}

function Badge({ label, color }: { label: string, color: string }) {
  return (
    <span 
      className="text-[9px] font-outfit font-medium tracking-[2px] uppercase px-2 py-1 rounded-full"
      style={{ backgroundColor: `${color}20`, color: color, border: `1px solid ${color}40` }}
    >
      {label}
    </span>
  );
}
