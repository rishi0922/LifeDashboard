import { NextResponse } from "next/server";

export async function GET() {
  const apiKey = process.env.WEATHER_API_KEY;
  
  // Fallback if key is missing.
  // Compute a plausible day/night flag from the current IST hour so the UI
  // sun/moon swap still works when running without a live WeatherAPI key.
  if (!apiKey || apiKey === "your_weatherapi_key_here") {
    const istNow = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
    const hour = istNow.getHours();
    const isDay = hour >= 6 && hour < 19;
    return NextResponse.json({
      status: "demo",
      temp: 32,
      feelsLike: 34,
      condition: "Partly Cloudy",
      iconCode: 1003,
      humidity: 45,
      aqi: 72, // Moderate Value
      aqiLabel: "Mod",
      isDay,
      lastSync: new Date().toISOString()
    });
  }

  try {
    const res = await fetch(
      `https://api.weatherapi.com/v1/current.json?key=${apiKey}&q=Hyderabad&aqi=yes`,
      { next: { revalidate: 60 } }
    );
    
    if (!res.ok) throw new Error("WeatherAPI refused connection");
    const data = await res.json();
    const air = data.current.air_quality;

    // Official Indian (CPCB) AQI Calculation for PM2.5
    // 0-30: (50/30)*C
    // 31-60: (50/30)*(C-30)+50
    // 61-90: (100/30)*(C-60)+100
    // 91-120: (100/30)*(C-90)+200
    // 121-250: (100/130)*(C-120)+300
    const pm25 = air.pm2_5;
    let aqi = 0;
    if (pm25 <= 30) aqi = (50 / 30) * pm25;
    else if (pm25 <= 60) aqi = (50 / 30) * (pm25 - 30) + 50;
    else if (pm25 <= 90) aqi = (100 / 30) * (pm25 - 60) + 100;
    else if (pm25 <= 120) aqi = (100 / 30) * (pm25 - 90) + 200;
    else if (pm25 <= 250) aqi = (100 / 130) * (pm25 - 120) + 300;
    else aqi = (100 / 250) * (pm25 - 250) + 400;

    return NextResponse.json({
      status: "live",
      temp: Math.round(data.current.temp_c),
      feelsLike: Math.round(data.current.feelslike_c),
      condition: data.current.condition.text,
      iconCode: data.current.condition.code,
      humidity: data.current.humidity,
      aqi: Math.round(Math.min(aqi, 500)),
      isDay: data.current.is_day === 1,
      lastSync: new Date().toISOString()
    });

  } catch (error: any) {
    console.error("Weather Proxy Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
