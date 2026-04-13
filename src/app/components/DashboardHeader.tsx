"use client";

import { useState, useEffect } from "react";
import { IPLScoreWidget } from "./IPLScoreWidget";

export function DashboardHeader() {
  const [time, setTime] = useState<string>("");
  const [date, setDate] = useState<string>("");
  const [weatherData, setWeatherData] = useState<any>(null);
  const [lastWeatherSync, setLastWeatherSync] = useState<string>("");

  // 1. Clock Logic
  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setTime(now.toLocaleTimeString("en-US", { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true }));
      setDate(now.toLocaleDateString("en-US", { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }));
    };
    updateTime();
    const timer = setInterval(updateTime, 1000);
    return () => clearInterval(timer);
  }, []);

  // 2. Weather Intelligence (Station-Verified)
  useEffect(() => {
    const fetchWeather = async () => {
      try {
        const res = await fetch("/api/weather");
        const data = await res.json();
        
        let icon = "☀️";
        const code = data.iconCode;
        if (code >= 1063 && code <= 1282) icon = "🌧️";
        else if (code >= 1003 && code <= 1030) icon = "🌤️";
        else if (code >= 1135 && code <= 1147) icon = "🌫️";
        else if (code >= 1000) icon = "☀️";

        setWeatherData({ ...data, icon });
        setLastWeatherSync(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
      } catch (err) {
        console.error("Weather refresh failed", err);
      }
    };

    fetchWeather();
    const weatherTimer = setInterval(fetchWeather, 120000); // Pulse every 2 mins
    return () => clearInterval(weatherTimer);
  }, []);

  const getAQILevel = (val: number) => {
    if (val <= 50) return { label: 'Good', color: 'var(--success-color)', icon: '🍃' };
    if (val <= 100) return { label: 'Mod', color: '#fbbf24', icon: '☁️' };
    return { label: 'Poor', color: '#f87171', icon: '😷' };
  };

  const getHumidityIcon = (h: number) => {
    if (h < 30) return '🌵';
    if (h > 65) return '🌊';
    return '💧';
  };

  return (
    <header className="glass-panel" style={{ 
      display: 'flex', 
      justifyContent: 'space-between', 
      alignItems: 'center', 
      padding: '0.6rem 2rem',
      margin: 0,
      width: '100%',
      marginBottom: '0.25rem',
    }}>
      {/* Time Hub */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0', flexShrink: 0 }}>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 800, margin: 0, letterSpacing: '-0.5px', fontVariantNumeric: 'tabular-nums', lineHeight: 1.1 }}>
          {time || "Loading..."}
        </h1>
        <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--text-secondary)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
          {date}
        </p>
      </div>

      {/* Right side: IPL pill + Weather */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexShrink: 0 }}>
        {/* ── IPL Score Pill ── */}
        <IPLScoreWidget />

        {/* Weather Hub */}
        {weatherData ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <div style={{ textAlign: 'right' }}>
              <p style={{ margin: 0, fontSize: '0.65rem', color: 'var(--text-secondary)', fontWeight: 700, letterSpacing: '0.5px' }}>HYDERABAD</p>
              <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', justifyContent: 'flex-end', marginTop: '0.1rem' }}>
                 <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', fontWeight: 600 }}>
                   {getHumidityIcon(weatherData.humidity)} {weatherData.humidity}%
                 </span>
                 <span style={{ fontSize: '0.7rem', color: getAQILevel(weatherData.aqi).color, fontWeight: 700 }}>
                   {getAQILevel(weatherData.aqi).icon} AQI {weatherData.aqi}
                 </span>
              </div>
            </div>
            <div style={{ 
              display: 'flex', 
              alignItems: 'center', 
              gap: '0.5rem',
              background: 'var(--bg-secondary)',
              padding: '0.4rem 0.8rem',
              borderRadius: 'var(--radius-xl)',
              border: '1px solid var(--border-color)'
            }}>
              <span style={{ fontSize: '1.25rem' }}>{weatherData.icon}</span>
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                 <span style={{ fontSize: '1.1rem', fontWeight: 800, lineHeight: 1 }}>{weatherData.temp}°C</span>
                 <span style={{ fontSize: '0.55rem', fontWeight: 700, color: 'var(--text-secondary)' }}>FEELS {weatherData.feelsLike}°</span>
              </div>
            </div>
          </div>
        ) : (
          <div className="animate-pulse" style={{ color: 'var(--text-secondary)', fontSize: '0.8rem' }}>
            Initializing Station...
          </div>
        )}
      </div>
    </header>
  );
}
