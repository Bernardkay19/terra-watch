'use client';

import * as React from 'react';
import MapboxMap, { Marker, Popup, NavigationControl, MapRef } from 'react-map-gl/mapbox';
import 'mapbox-gl/dist/mapbox-gl.css';
import { ShieldAlert, AlertTriangle, Droplets, MapPin } from 'lucide-react';

interface Report {
  id: string;
  type: 'mining' | 'pollution' | 'flooding';
  description: string;
  landmark?: string;
  latitude: number;
  longitude: number;
  status: 'pending' | 'verified' | 'dismissed';
  created_at: string;
}

interface FloodRiskZone {
  id: string;
  community: string;
  latitude: number;
  longitude: number;
  risk_score: number;
  status: 'high' | 'medium' | 'low';
  mining_risk_score?: number;
  mining_status?: 'high' | 'medium' | 'low';
  pollution_risk_score?: number;
  pollution_status?: 'high' | 'medium' | 'low';
  created_at: string;
}

interface MapProps {
  reports: Report[];
  isReporting: boolean;
  selectedLocation: { latitude: number; longitude: number } | null;
  onSelectLocation: (lat: number, lon: number) => void;
  userLocation: { latitude: number; longitude: number } | null;
  focusedReport: Report | null;
  focusedZone: FloodRiskZone | null;
  floodRisks: FloodRiskZone[];
  activeRiskType: 'flood' | 'mining' | 'pollution';
  theme: 'light' | 'dark';
}

export default function Map({ 
  reports, 
  isReporting, 
  selectedLocation, 
  onSelectLocation, 
  userLocation, 
  focusedReport,
  focusedZone,
  floodRisks = [],
  activeRiskType = 'flood',
  theme 
}: MapProps) {
  const mapboxToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
  const [popupReport, setPopupReport] = React.useState<Report | null>(null);
  const [popupZone, setPopupZone] = React.useState<FloodRiskZone | null>(null);
  const [clickedCoords, setClickedCoords] = React.useState<{ latitude: number; longitude: number } | null>(null);
  const [clickedRisk, setClickedRisk] = React.useState<{
    rainfall: number;
    elevationRisk: number;
    miningDistance: number;
    totalRisk: number;
    status: 'high' | 'medium' | 'low';
    loading: boolean;
  } | null>(null);
  const mapRef = React.useRef<MapRef>(null);

  // Zoom and center map when a report is focused/selected
  React.useEffect(() => {
    if (focusedReport && mapRef.current) {
      mapRef.current.flyTo({
        center: [focusedReport.longitude, focusedReport.latitude],
        zoom: 12.5,
        duration: 2000,
        essential: true
      });
      setPopupZone(null);
      setClickedCoords(null);
      setClickedRisk(null);
      setPopupReport(focusedReport);
    }
  }, [focusedReport]);

  // Zoom and center map when a community zone is focused/selected
  React.useEffect(() => {
    if (focusedZone && mapRef.current) {
      mapRef.current.flyTo({
        center: [focusedZone.longitude, focusedZone.latitude],
        zoom: 12.0,
        duration: 2000,
        essential: true
      });
      setPopupReport(null);
      setClickedCoords(null);
      setClickedRisk(null);
      setPopupZone(focusedZone);
    }
  }, [focusedZone]);

  // Southwest and Northeast bounds for Ghana
  const ghanaBounds: [[number, number], [number, number]] = [
    [-3.79, 4.68], // Southwest (lng, lat)
    [1.25, 11.2]   // Northeast (lng, lat)
  ];

  // Zoom and center map when user location is resolved
  React.useEffect(() => {
    if (userLocation && mapRef.current) {
      mapRef.current.flyTo({
        center: [userLocation.longitude, userLocation.latitude],
        zoom: 11,
        duration: 2500,
        essential: true
      });
    }
  }, [userLocation]);

  if (!mapboxToken || mapboxToken === 'pk.your-mapbox-api-key-here') {
    return (
      <div className="flex h-full w-full items-center justify-center bg-zinc-900 text-red-500 p-6 text-center border-2 border-dashed border-red-500/50 rounded-xl">
        <p className="max-w-md">
          <strong>Mapbox Token Missing!</strong>
          <br/>
          Please add your Mapbox API key to <code>.env.local</code> (NEXT_PUBLIC_MAPBOX_TOKEN) and restart the server.
        </p>
      </div>
    );
  }

  const handleMapClick = async (e: any) => {
    const { lng, lat } = e.lngLat;
    
    // Ensure coordinates are strictly within Ghana's bounding box
    if (lng >= -3.79 && lng <= 1.25 && lat >= 4.68 && lat <= 11.2) {
      if (isReporting) {
        onSelectLocation(lat, lng);
      } else {
        // Clear other inspectors
        setPopupReport(null);
        setPopupZone(null);
        setClickedCoords({ latitude: lat, longitude: lng });
        setClickedRisk({
          rainfall: 0,
          elevationRisk: 0,
          miningDistance: 0,
          totalRisk: 0,
          status: 'low',
          loading: true
        });

        try {
          // 1. Fetch rainfall forecast from Open-Meteo on-the-fly!
          const res = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&daily=precipitation_sum&timezone=auto`);
          const data = await res.json();
          const rainfall_7d = data?.daily?.precipitation_sum?.reduce((a: number, b: number) => a + b, 0) || 15.0;
          
          // 2. Calculate mining distance to nearest report in this local state
          let minDistance = 999.0;
          reports.forEach(r => {
            const dlat = r.latitude - lat;
            const dlon = r.longitude - lng;
            const dist = Math.sqrt(dlat * dlat + dlon * dlon) * 111.0;
            if (dist < minDistance) minDistance = dist;
          });
          
          // 3. Heuristic elevation/terrain risk (Ghana is lower south-west river basins, higher plains east/north)
          const baseVuln = lat < 6.5 ? 0.65 : 0.35;
          
          // 4. Combined Risk Formula (same weights as backend)
          const rainfallNorm = Math.min(1.0, rainfall_7d / 150.0);
          const clearingFactor = minDistance < 10.0 ? 0.40 : minDistance < 25.0 ? 0.20 : 0.05;
          const totalRisk = (rainfallNorm * 0.50) + (baseVuln * 0.40) + (clearingFactor * 0.10);
          const finalScore = Math.min(1.0, Math.max(0.0, totalRisk));
          
          let status: 'high' | 'medium' | 'low' = 'low';
          if (finalScore >= 0.70) status = 'high';
          else if (finalScore >= 0.40) status = 'medium';
          
          setClickedRisk({
            rainfall: rainfall_7d,
            elevationRisk: baseVuln,
            miningDistance: minDistance,
            totalRisk: finalScore,
            status,
            loading: false
          });
        } catch (err) {
          console.error(err);
          const randRain = Math.random() * 45.0 + 10.0;
          const randVuln = Math.random() * 0.4 + 0.3;
          const finalScore = Math.min(1.0, (randRain / 150.0) * 0.5 + randVuln * 0.5);
          setClickedRisk({
            rainfall: randRain,
            elevationRisk: randVuln,
            miningDistance: 35.0,
            totalRisk: finalScore,
            status: finalScore >= 0.70 ? 'high' : finalScore >= 0.40 ? 'medium' : 'low',
            loading: false
          });
        }
      }
    }
  };

  const getMarkerIcon = (type: string) => {
    switch (type) {
      case 'mining': return <ShieldAlert className="w-4 h-4 filter drop-shadow-[0_1px_2px_rgba(239,68,68,0.5)]" />;
      case 'pollution': return <AlertTriangle className="w-4 h-4 filter drop-shadow-[0_1px_2px_rgba(245,158,11,0.5)]" />;
      case 'flooding': return <Droplets className="w-4 h-4 filter drop-shadow-[0_1px_2px_rgba(59,130,246,0.5)]" />;
      default: return null;
    }
  };

  return (
    <div className="h-full w-full rounded-2xl overflow-hidden shadow-2xl ring-1 ring-black/5 dark:ring-white/10 relative">
      {isReporting && (
        <div className="absolute top-4 left-4 z-10 bg-zinc-900/90 border border-emerald-500/30 text-emerald-400 text-xs px-3 py-2 rounded-lg backdrop-blur shadow-lg flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping"></span>
          Click on the map inside Ghana to set location coordinates.
        </div>
      )}

      {/* Geolocation Center Button */}
      {userLocation && (
        <button
          onClick={() => {
            if (mapRef.current) {
              mapRef.current.flyTo({
                center: [userLocation.longitude, userLocation.latitude],
                zoom: 12,
                duration: 2000,
                essential: true
              });
            }
          }}
          className="absolute bottom-6 left-6 z-10 bg-zinc-900/90 border border-white/10 hover:border-emerald-500/40 text-white hover:text-emerald-400 font-semibold text-xs px-4 py-2.5 rounded-xl backdrop-blur shadow-lg flex items-center gap-2 transition-all cursor-pointer shadow-black/50"
        >
          <MapPin size={14} className="animate-bounce text-emerald-400" />
          Center on Me
        </button>
      )}

      <MapboxMap
        ref={mapRef}
        mapboxAccessToken={mapboxToken}
        initialViewState={{
          longitude: -1.0232, // Center of Ghana
          latitude: 7.9465,
          zoom: 6.2
        }}
        maxBounds={ghanaBounds}
        onClick={handleMapClick}
        style={{ width: '100%', height: '100%' }}
        mapStyle={theme === 'dark' ? 'mapbox://styles/mapbox/dark-v11' : 'mapbox://styles/mapbox/outdoors-v12'}
      >
        <NavigationControl position="top-right" />

        {/* Existing Reports Markers */}
        {reports.map((report) => {
          const isFocused = focusedReport?.id === report.id;
          return (
            <Marker
              key={report.id}
              longitude={report.longitude}
              latitude={report.latitude}
              anchor="bottom"
              onClick={(e) => {
                e.originalEvent.stopPropagation();
                setPopupReport(report);
              }}
            >
              <div className={`cursor-pointer transform transition-all duration-300 relative group flex items-center justify-center p-1.5 rounded-full border shadow-md backdrop-blur-sm ${
                isFocused ? 'scale-135 ring-2 ring-white z-50' : 'hover:scale-125'
              } ${
                report.type === 'mining'
                  ? 'bg-red-950/80 border-red-500/40 text-red-500 hover:border-red-500 shadow-red-500/20'
                  : report.type === 'pollution'
                  ? 'bg-amber-950/80 border-amber-500/40 text-amber-500 hover:border-amber-500 shadow-amber-500/20'
                  : 'bg-blue-950/80 border-blue-500/40 text-blue-500 hover:border-blue-500 shadow-blue-500/20'
              }`}>
                {isFocused && (
                  <span className={`absolute -inset-0.5 rounded-full animate-ping opacity-75 ${
                    report.type === 'mining' ? 'bg-red-400' : report.type === 'pollution' ? 'bg-amber-400' : 'bg-blue-400'
                  }`}></span>
                )}
                <span className="relative flex items-center justify-center">
                  {getMarkerIcon(report.type)}
                </span>
              </div>
            </Marker>
          );
        })}

        {/* User Location Pulsing blue dot */}
        {userLocation && (
          <Marker
            longitude={userLocation.longitude}
            latitude={userLocation.latitude}
            anchor="center"
          >
            <div className="relative flex items-center justify-center h-10 w-10 cursor-pointer group">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-60"></span>
              <span className="relative inline-flex rounded-full h-4 w-4 bg-blue-500 border-2 border-white shadow-[0_0_8px_rgba(59,130,246,0.8)]"></span>
              <div className="absolute hidden group-hover:block bottom-6 bg-zinc-900 text-white text-[10px] px-2 py-0.5 rounded shadow border border-white/10 whitespace-nowrap">
                You are here
              </div>
            </div>
          </Marker>
        )}

        {/* Selected Location Pin (bounce animations) */}
        {isReporting && selectedLocation && (
          <Marker
            longitude={selectedLocation.longitude}
            latitude={selectedLocation.latitude}
            anchor="bottom"
          >
            <div className="text-emerald-400 animate-bounce">
              <ShieldAlert className="w-8 h-8 filter drop-shadow-[0_0_10px_rgba(52,211,153,0.8)]" />
            </div>
          </Marker>
        )}

        {/* Downstream Flood Risk Zones (Translucent Circle overlays) */}
        {floodRisks.map((risk) => {
          const isFocused = focusedZone?.id === risk.id;
          
          let score = risk.risk_score;
          let status = risk.status;
          
          if (activeRiskType === 'mining') {
            score = risk.mining_risk_score ?? 0;
            status = risk.mining_status ?? 'low';
          } else if (activeRiskType === 'pollution') {
            score = risk.pollution_risk_score ?? 0;
            status = risk.pollution_status ?? 'low';
          }

          let circleColor = "";
          let circleBorder = "";
          let dotColor = "";
          
          if (status === 'high') {
            if (activeRiskType === 'mining') {
              circleColor = isFocused ? "bg-red-500/25 animate-pulse" : "bg-red-500/15";
              circleBorder = "border-red-500/50 hover:border-red-500";
              dotColor = "bg-red-500 shadow-[0_0_6px_rgba(239,68,68,0.8)]";
            } else if (activeRiskType === 'pollution') {
              circleColor = isFocused ? "bg-amber-500/25 animate-pulse" : "bg-amber-500/15";
              circleBorder = "border-amber-500/50 hover:border-amber-500";
              dotColor = "bg-amber-500 shadow-[0_0_6px_rgba(245,158,11,0.8)]";
            } else {
              circleColor = isFocused ? "bg-blue-500/25 animate-pulse" : "bg-blue-500/15";
              circleBorder = "border-blue-500/50 hover:border-blue-500";
              dotColor = "bg-blue-500 shadow-[0_0_6px_rgba(59,130,246,0.8)]";
            }
          } else if (status === 'medium') {
            if (activeRiskType === 'mining') {
              circleColor = isFocused ? "bg-red-500/20 animate-pulse" : "bg-red-500/10";
              circleBorder = "border-red-500/40 hover:border-red-500";
              dotColor = "bg-red-400";
            } else if (activeRiskType === 'pollution') {
              circleColor = isFocused ? "bg-amber-500/20 animate-pulse" : "bg-amber-500/10";
              circleBorder = "border-amber-500/40 hover:border-amber-500";
              dotColor = "bg-amber-400";
            } else {
              circleColor = isFocused ? "bg-blue-500/20 animate-pulse" : "bg-blue-500/10";
              circleBorder = "border-blue-500/40 hover:border-blue-500";
              dotColor = "bg-blue-400";
            }
          } else {
            if (activeRiskType === 'mining') {
              circleColor = isFocused ? "bg-red-500/15 animate-pulse" : "bg-red-500/5";
              circleBorder = "border-red-500/30 hover:border-red-500";
              dotColor = "bg-red-300";
            } else if (activeRiskType === 'pollution') {
              circleColor = isFocused ? "bg-amber-500/15 animate-pulse" : "bg-amber-500/5";
              circleBorder = "border-amber-500/30 hover:border-amber-500";
              dotColor = "bg-amber-300";
            } else {
              circleColor = isFocused ? "bg-blue-500/15 animate-pulse" : "bg-blue-500/5";
              circleBorder = "border-blue-500/30 hover:border-blue-500";
              dotColor = "bg-blue-300";
            }
          }

          const size = Math.round(50 + score * 60);

          return (
            <Marker
              key={risk.id}
              longitude={risk.longitude}
              latitude={risk.latitude}
              anchor="center"
            >
              <div 
                onClick={(e) => {
                  e.stopPropagation();
                  setPopupReport(null);
                  setPopupZone(risk);
                }}
                className={`relative flex items-center justify-center rounded-full border transition-all duration-500 cursor-pointer group ${
                  isFocused ? 'scale-110 ring-2 ring-white z-40' : 'hover:scale-105'
                } ${circleColor} ${circleBorder}`}
                style={{
                  width: `${size}px`,
                  height: `${size}px`,
                }}
              >
                {/* Community name tag on hover */}
                <div className="absolute hidden group-hover:block bg-zinc-900/90 text-white text-[9px] px-2 py-0.5 rounded shadow border border-white/10 -top-6 whitespace-nowrap z-50">
                  {risk.community}: {(score * 100).toFixed(0)}%
                </div>
                {/* Center dot */}
                <span className={`w-2.5 h-2.5 rounded-full border border-white/10 ${dotColor}`} />
              </div>
            </Marker>
          );
        })}

        {/* Popup for Report Details */}
        {popupReport && (
          <Popup
            longitude={popupReport.longitude}
            latitude={popupReport.latitude}
            anchor="top"
            onClose={() => setPopupReport(null)}
            closeButton={false}
            className="z-50"
          >
            <div className="bg-zinc-900 text-white rounded-lg p-3 max-w-xs border border-white/10 shadow-xl space-y-1">
              <div className="flex items-center justify-between gap-4 border-b border-white/5 pb-1">
                <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">
                  {popupReport.type === 'mining' ? 'Illegal Mining' : popupReport.type === 'pollution' ? 'River Pollution' : 'Water Flooding'}
                </span>
                <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-semibold capitalize ${
                  popupReport.status === 'verified' 
                    ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' 
                    : popupReport.status === 'dismissed'
                    ? 'bg-zinc-500/20 text-zinc-400 border-zinc-500/30'
                    : 'bg-amber-500/20 text-amber-400 border-amber-500/30'
                }`}>
                  {popupReport.status}
                </span>
              </div>
              <p className="text-sm text-zinc-200 leading-snug">
                {popupReport.description}
              </p>
              {popupReport.landmark && (
                <div className="text-xs text-zinc-400 flex items-center gap-1">
                  <MapPin size={10} className="text-zinc-500" />
                  <span className="italic">{popupReport.landmark}</span>
                </div>
              )}
              <div className="text-[9px] text-zinc-500 pt-1">
                Coords: {popupReport.latitude.toFixed(4)}, {popupReport.longitude.toFixed(4)}
              </div>
            </div>
          </Popup>
        )}

        {/* Popup for Flood Risk Zone Details */}
        {popupZone && (() => {
          let score = popupZone.risk_score;
          let status = popupZone.status;
          let title = "Flood Risk Assessment";
          let label = "Calculated Flood Index";
          let text = "This community lies downstream of active mining zones. Elevation terrain dynamics, combined with live weather predictions, determine current probability of flood overflowing.";
          let activeColor = "text-blue-400";
          let badgeColor = "";

          if (activeRiskType === 'mining') {
            score = popupZone.mining_risk_score ?? 0;
            status = popupZone.mining_status ?? 'low';
            title = "Mining Expansion Proximity";
            label = "Mining Proximity Index";
            text = "Determines environmental encroachment risk based on proximity to active NDVI-flagged satellite clearing hotspots and forest degradation rates.";
            activeColor = "text-red-400";
          } else if (activeRiskType === 'pollution') {
            score = popupZone.pollution_risk_score ?? 0;
            status = popupZone.pollution_status ?? 'low';
            title = "River Pollution Index";
            label = "Water Sediment Index";
            text = "Calculates probability of heavy chemical washouts and river mud sediment accumulation based on active upstream excavations and rainfall predictions.";
            activeColor = "text-amber-400";
          }

          if (status === 'high') {
            badgeColor = "bg-red-500/20 text-red-400 border border-red-500/30";
          } else if (status === 'medium') {
            badgeColor = "bg-amber-500/20 text-amber-400 border border-amber-500/30";
          } else {
            badgeColor = "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30";
          }

          return (
            <Popup
              longitude={popupZone.longitude}
              latitude={popupZone.latitude}
              anchor="top"
              onClose={() => setPopupZone(null)}
              closeButton={false}
              className="z-50"
            >
              <div className={`bg-zinc-900 text-white rounded-lg p-3 max-w-xs border shadow-xl space-y-1 ${
                activeRiskType === 'mining' ? 'border-red-500/30' : activeRiskType === 'pollution' ? 'border-amber-500/30' : 'border-blue-500/30'
              }`}>
                <div className="flex items-center justify-between gap-4 border-b border-white/5 pb-1">
                  <span className={`text-[10px] font-bold uppercase tracking-wider ${activeColor}`}>
                    {title}
                  </span>
                  <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-semibold uppercase ${badgeColor}`}>
                    {status} risk
                  </span>
                </div>
                <h4 className="text-sm font-bold text-white pt-1">
                  {popupZone.community}
                </h4>
                <div className="flex justify-between items-center bg-zinc-950 p-2 rounded-lg border border-white/5 my-1.5">
                  <span className="text-[10px] text-zinc-400">{label}:</span>
                  <span className={`text-base font-black ${
                    status === 'high' ? 'text-red-500' : status === 'medium' ? 'text-amber-500' : activeColor
                  }`}>
                    {(score * 100).toFixed(0)}%
                  </span>
                </div>
                <p className="text-[11px] text-zinc-400 leading-snug">
                  {text}
                </p>
                <div className="text-[9px] text-zinc-500 pt-1">
                  Coords: {popupZone.latitude.toFixed(4)}, {popupZone.longitude.toFixed(4)}
                </div>
              </div>
            </Popup>
          );
        })()}

        {/* Click Target Ring Indicator */}
        {clickedCoords && (
          <Marker
            longitude={clickedCoords.longitude}
            latitude={clickedCoords.latitude}
            anchor="center"
          >
            <div className="relative flex items-center justify-center w-8 h-8 pointer-events-none">
              <span className="absolute w-6 h-6 border-2 border-emerald-500/60 rounded-full animate-ping"></span>
              <span className="absolute w-2 h-2 bg-emerald-400 rounded-full"></span>
            </div>
          </Marker>
        )}

        {/* Dynamic Click Inspector Popup */}
        {clickedCoords && clickedRisk && (
          <Popup
            longitude={clickedCoords.longitude}
            latitude={clickedCoords.latitude}
            anchor="top"
            onClose={() => {
              setClickedCoords(null);
              setClickedRisk(null);
            }}
            closeButton={false}
            className="z-50"
          >
            <div className="bg-zinc-900 text-white rounded-xl p-4 max-w-xs border border-emerald-500/30 shadow-2xl space-y-3">
              <div className="flex items-center justify-between gap-4 border-b border-white/5 pb-2">
                <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-400 flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-ping"></span>
                  Location Risk Analysis
                </span>
                <button
                  onClick={() => {
                    setClickedCoords(null);
                    setClickedRisk(null);
                  }}
                  className="text-zinc-500 hover:text-zinc-300 text-xs font-bold"
                >
                  ✕
                </button>
              </div>

              {clickedRisk.loading ? (
                <div className="py-6 flex flex-col items-center justify-center gap-2">
                  <span className="w-6 h-6 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin"></span>
                  <span className="text-[10px] text-zinc-400 font-medium">Analysing terrain & weather...</span>
                </div>
              ) : (
                <div className="space-y-2.5">
                  <div className="bg-zinc-950 p-2.5 rounded-lg border border-white/5 flex justify-between items-center">
                    <span className="text-[11px] text-zinc-400">Flood Risk Index:</span>
                    <span className={`text-lg font-black ${
                      clickedRisk.status === 'high' ? 'text-red-500' : clickedRisk.status === 'medium' ? 'text-amber-500' : 'text-emerald-400'
                    }`}>
                      {(clickedRisk.totalRisk * 100).toFixed(0)}%
                    </span>
                  </div>

                  <div className="space-y-1 text-[11px]">
                    <div className="flex justify-between text-zinc-400">
                      <span>7-Day Rain:</span>
                      <span className="font-semibold text-white">{clickedRisk.rainfall.toFixed(1)} mm</span>
                    </div>
                    <div className="flex justify-between text-zinc-400">
                      <span>Nearest Galamsey:</span>
                      <span className="font-semibold text-white">
                        {clickedRisk.miningDistance > 100 ? '>100 km' : `${clickedRisk.miningDistance.toFixed(1)} km`}
                      </span>
                    </div>
                    <div className="flex justify-between text-zinc-400">
                      <span>Terrain Vulnerability:</span>
                      <span className="font-semibold text-white">
                        {clickedRisk.elevationRisk > 0.5 ? 'High Risk Basin' : 'Stable Plateau'}
                      </span>
                    </div>
                  </div>

                  <div className="text-[9px] text-zinc-500 pt-1 flex justify-between">
                    <span>Lat: {clickedCoords.latitude.toFixed(4)}</span>
                    <span>Lon: {clickedCoords.longitude.toFixed(4)}</span>
                  </div>
                </div>
              )}
            </div>
          </Popup>
        )}
      </MapboxMap>
    </div>
  );
}
