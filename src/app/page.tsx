"use client";

import * as React from "react";
import dynamic from "next/dynamic";
import {
  AlertCircle,
  Activity,
  Droplets,
  MapPin,
  Loader2,
  Calendar,
  ShieldAlert,
  AlertTriangle,
  Search,
  Crosshair,
  Thermometer,
  Wind,
} from "lucide-react";
import { supabase } from "../lib/supabase";

const Map = dynamic(() => import("@/components/Map"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full w-full items-center justify-center bg-zinc-900 text-zinc-500 rounded-xl">
      Loading Map...
    </div>
  ),
});

interface Report {
  id: string;
  type: "mining" | "pollution" | "flooding";
  description: string;
  latitude: number;
  longitude: number;
  status: "pending" | "verified" | "dismissed";
  created_at: string;
}

interface FloodRiskZone {
  id: string;
  community: string;
  latitude: number;
  longitude: number;
  risk_score: number;
  status: "high" | "medium" | "low";
  mining_risk_score?: number;
  mining_status?: "high" | "medium" | "low";
  pollution_risk_score?: number;
  pollution_status?: "high" | "medium" | "low";
  created_at: string;
}

export default function Home() {
  const [reports, setReports] = React.useState<Report[]>([]);
  const [floodRisks, setFloodRisks] = React.useState<FloodRiskZone[]>([]);
  const [loading, setLoading] = React.useState<boolean>(true);
  const [isReporting, setIsReporting] = React.useState<boolean>(false);
  const [submitting, setSubmitting] = React.useState<boolean>(false);
  const [selectedLocation, setSelectedLocation] = React.useState<{
    latitude: number;
    longitude: number;
  } | null>(null);
  const [userLocation, setUserLocation] = React.useState<{
    latitude: number;
    longitude: number;
  } | null>(null);
  const [focusedReport, setFocusedReport] = React.useState<Report | null>(null);
  const [focusedZone, setFocusedZone] = React.useState<FloodRiskZone | null>(
    null,
  );
  const [selectedCategoryFilter, setSelectedCategoryFilter] =
    React.useState<string>("all");
  const [activeTab, setActiveTab] = React.useState<
    "reports" | "flood_risk" | "search"
  >("reports");
  const [activeRiskType, setActiveRiskType] = React.useState<
    "flood" | "mining" | "pollution"
  >("flood");

  // Location Search State
  const [searchQuery, setSearchQuery] = React.useState<string>("");
  const [searchLoading, setSearchLoading] = React.useState<boolean>(false);
  const [searchResult, setSearchResult] = React.useState<{
    name: string;
    latitude: number;
    longitude: number;
    rainfall: number;
    floodRisk: number;
    floodStatus: "high" | "medium" | "low";
    miningDistance: number;
    miningRisk: number;
    miningStatus: "high" | "medium" | "low";
    pollutionRisk: number;
    pollutionStatus: "high" | "medium" | "low";
    temperature: number;
    windspeed: number;
  } | null>(null);
  const [searchError, setSearchError] = React.useState<string>("");
  const [searchFocused, setSearchFocused] = React.useState<{
    latitude: number;
    longitude: number;
  } | null>(null);

  // Form State
  const [reportType, setReportType] = React.useState<
    "mining" | "pollution" | "flooding"
  >("mining");
  const [description, setDescription] = React.useState<string>("");

  // Get User Location by Default
  React.useEffect(() => {
    if (typeof window !== "undefined" && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const { latitude, longitude } = position.coords;
          setUserLocation({ latitude, longitude });
        },
        (error) => {
          console.warn("Geolocation access denied or error:", error);
        },
        { enableHighAccuracy: true, timeout: 10000 },
      );
    }
  }, []);

  // Pre-fill location coordinates for report if user is in Ghana
  React.useEffect(() => {
    if (isReporting && !selectedLocation && userLocation) {
      const { latitude, longitude } = userLocation;
      if (
        longitude >= -3.79 &&
        longitude <= 1.25 &&
        latitude >= 4.68 &&
        latitude <= 11.2
      ) {
        setSelectedLocation({ latitude, longitude });
      }
    }
  }, [isReporting, userLocation, selectedLocation]);

  const fetchReports = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from("reports")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;
      setReports(data || []);
    } catch (err) {
      console.error("Error fetching reports:", err);
    } finally {
      setLoading(false);
    }
  };

  const fetchFloodRisks = async () => {
    try {
      const { data, error } = await supabase
        .from("flood_risk")
        .select("*")
        .order("risk_score", { ascending: false });

      if (error) throw error;
      setFloodRisks(data || []);
    } catch (err) {
      console.error("Error fetching flood risks:", err);
    }
  };

  React.useEffect(() => {
    fetchReports();
    fetchFloodRisks();
  }, []);

  const handleSelectLocation = (lat: number, lon: number) => {
    setSelectedLocation({ latitude: lat, longitude: lon });
  };

  const handleLocationSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;

    setSearchLoading(true);
    setSearchError("");
    setSearchResult(null);

    try {
      const mapboxToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
      // 1. Geocode location name using Mapbox
      const geoRes = await fetch(
        `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(searchQuery)}.json?country=GH&limit=1&access_token=${mapboxToken}`,
      );
      const geoData = await geoRes.json();

      if (!geoData.features || geoData.features.length === 0) {
        setSearchError(
          'Location not found. Try a town or city in Ghana (e.g. "Tarkwa", "Obuasi", "Kumasi").',
        );
        setSearchLoading(false);
        return;
      }

      const feature = geoData.features[0];
      const [lng, lat] = feature.center;
      const locationName = feature.place_name;

      // 2. Fetch weather from Open-Meteo
      const weatherRes = await fetch(
        `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&daily=precipitation_sum&current_weather=true&timezone=auto`,
      );
      const weatherData = await weatherRes.json();
      const rainfall7d =
        weatherData?.daily?.precipitation_sum?.reduce(
          (a: number, b: number) => a + b,
          0,
        ) || 15.0;
      const temperature = weatherData?.current_weather?.temperature ?? 28.0;
      const windspeed = weatherData?.current_weather?.windspeed ?? 12.0;

      // 3. Distance to nearest mining report
      let minDistance = 999.0;
      reports.forEach((r) => {
        const dlat = r.latitude - lat;
        const dlon = r.longitude - lng;
        const dist = Math.sqrt(dlat * dlat + dlon * dlon) * 111.0;
        if (dist < minDistance) minDistance = dist;
      });

      // 4. Compute risk scores (same formulas as backend)
      const baseVuln = lat < 6.5 ? 0.65 : 0.35;
      const clearingFactor =
        minDistance < 10 ? 0.4 : minDistance < 25 ? 0.2 : 0.05;
      const rainfallNorm = Math.min(1.0, rainfall7d / 150.0);

      const floodRisk = Math.min(
        1.0,
        rainfallNorm * 0.5 + baseVuln * 0.4 + clearingFactor * 0.1,
      );
      const miningRisk = Math.min(1.0, Math.max(0.1, 1.0 - minDistance / 50.0));
      const pollutionNorm = Math.min(1.0, rainfall7d / 120.0);
      const pollutionRisk = Math.min(
        1.0,
        pollutionNorm * 0.4 + clearingFactor * 0.4 + baseVuln * 0.2,
      );

      const scoreToStatus = (s: number): "high" | "medium" | "low" =>
        s >= 0.7 ? "high" : s >= 0.4 ? "medium" : "low";

      setSearchResult({
        name: locationName,
        latitude: lat,
        longitude: lng,
        rainfall: rainfall7d,
        floodRisk,
        floodStatus: scoreToStatus(floodRisk),
        miningDistance: minDistance,
        miningRisk,
        miningStatus: scoreToStatus(miningRisk),
        pollutionRisk,
        pollutionStatus: scoreToStatus(pollutionRisk),
        temperature,
        windspeed,
      });

      // Pan map to result
      setSearchFocused({ latitude: lat, longitude: lng });
    } catch (err) {
      console.error(err);
      setSearchError(
        "Failed to fetch location data. Please check your connection and try again.",
      );
    } finally {
      setSearchLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedLocation || !description.trim()) return;

    try {
      setSubmitting(true);
      const { error } = await supabase.from("reports").insert([
        {
          type: reportType,
          description: description.trim(),
          latitude: selectedLocation.latitude,
          longitude: selectedLocation.longitude,
          status: "pending",
        },
      ]);

      if (error) throw error;

      // Reset state and refresh
      setIsReporting(false);
      setDescription("");
      setSelectedLocation(null);
      await fetchReports();
    } catch (err) {
      console.error("Error submitting report:", err);
      alert(
        "Failed to submit report. Please verify your Supabase database table `reports` has been created by running `supabase_schema.sql` in your SQL Editor.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  const getAlertIcon = (type: string) => {
    switch (type) {
      case "mining":
        return <ShieldAlert className="text-red-500 w-5 h-5 flex-shrink-0" />;
      case "pollution":
        return (
          <AlertTriangle className="text-amber-500 w-5 h-5 flex-shrink-0" />
        );
      case "flooding":
        return <Droplets className="text-blue-500 w-5 h-5 flex-shrink-0" />;
      default:
        return null;
    }
  };

  const formatTimeAgo = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);

    if (diffMins < 1) return "Just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    return date.toLocaleDateString();
  };

  const miningCount = reports.filter((r) => r.type === "mining").length;
  const pollutionCount = reports.filter((r) => r.type === "pollution").length;
  const floodingCount = reports.filter((r) => r.type === "flooding").length;

  const filteredReports = reports.filter((report) => {
    if (selectedCategoryFilter === "all") return true;
    return report.type === selectedCategoryFilter;
  });

  return (
    <div className="flex flex-col lg:flex-row h-screen bg-zinc-950 text-white overflow-hidden font-sans">
      {/* Sidebar */}
      <aside className="w-full lg:w-96 lg:border-r border-b lg:border-b-0 border-white/10 flex flex-col bg-zinc-900/50 backdrop-blur-xl max-h-[40vh] lg:max-h-screen overflow-y-auto lg:overflow-y-auto">
        {/* Header */}
        <div className="p-3 lg:p-6 border-b border-white/10">
          <h1 className="text-lg lg:text-2xl font-bold tracking-tight text-white flex items-center gap-2">
            <Activity className="text-emerald-500 w-5 lg:w-6 h-5 lg:h-6 animate-pulse" />
            Terra Watch
          </h1>
          <p className="text-xs lg:text-sm text-zinc-400 mt-1">
            Ghana Illegal Mining & Flood Control
          </p>
        </div>

        {/* Scrollable content area */}
        <div className="flex-1 overflow-y-auto p-3 lg:p-6 space-y-3 lg:space-y-6">
          {/* Stats Summary Panel */}
          <div className="grid grid-cols-3 gap-1.5 lg:gap-2.5">
            <div className="bg-red-500/10 border border-red-500/20 rounded-lg lg:rounded-xl p-1.5 lg:p-2 text-center transition-all hover:bg-red-500/15">
              <span className="text-[8px] lg:text-[10px] font-bold text-red-400 block uppercase tracking-wider animate-pulse">
                Mining
              </span>
              <span className="text-lg lg:text-xl font-extrabold text-red-500">
                {miningCount}
              </span>
            </div>
            <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg lg:rounded-xl p-1.5 lg:p-2 text-center transition-all hover:bg-amber-500/15">
              <span className="text-[8px] lg:text-[10px] font-bold text-amber-400 block uppercase tracking-wider">
                Pollution
              </span>
              <span className="text-lg lg:text-xl font-extrabold text-amber-500">
                {pollutionCount}
              </span>
            </div>
            <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg lg:rounded-xl p-1.5 lg:p-2 text-center transition-all hover:bg-blue-500/15">
              <span className="text-[8px] lg:text-[10px] font-bold text-blue-400 block uppercase tracking-wider">
                Flooding
              </span>
              <span className="text-lg lg:text-xl font-extrabold text-blue-500">
                {floodingCount}
              </span>
            </div>
          </div>

          {/* Tab Navigation */}
          <div className="grid grid-cols-3 bg-zinc-950 p-0.5 lg:p-1 border border-white/5 rounded-lg lg:rounded-xl gap-0.5 lg:gap-1">
            <button
              onClick={() => setActiveTab("reports")}
              className={`py-1 lg:py-2 text-[7px] lg:text-[10px] font-bold rounded-lg transition-all cursor-pointer text-center ${
                activeTab === "reports"
                  ? "bg-emerald-600 text-white shadow-md"
                  : "text-zinc-500 hover:text-zinc-300"
              }`}
            >
              Citizen Reports
            </button>
            <button
              onClick={() => setActiveTab("flood_risk")}
              className={`py-1 lg:py-2 text-[7px] lg:text-[10px] font-bold rounded-lg transition-all cursor-pointer text-center ${
                activeTab === "flood_risk"
                  ? "bg-blue-600 text-white shadow-md"
                  : "text-zinc-500 hover:text-zinc-300"
              }`}
            >
              AI Risk
            </button>
            <button
              onClick={() => setActiveTab("search")}
              className={`py-1 lg:py-2 text-[7px] lg:text-[10px] font-bold rounded-lg transition-all cursor-pointer text-center flex items-center justify-center gap-0.5 lg:gap-1 ${
                activeTab === "search"
                  ? "bg-violet-600 text-white shadow-md"
                  : "text-zinc-500 hover:text-zinc-300"
              }`}
            >
              <Search size={8} className="lg:hidden" />
              <Search size={10} className="hidden lg:block" />
              <span className="hidden sm:inline">Inspect</span>
            </button>
          </div>

          {activeTab === "reports" ? (
            <>
              {/* Category Filter Tabs */}
              <div className="space-y-1.5 lg:space-y-2">
                <label className="text-[8px] lg:text-[10px] uppercase font-bold tracking-wider text-zinc-400">
                  Filter
                </label>
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-0.5 lg:gap-1 bg-zinc-950 p-0.5 lg:p-1 border border-white/5 rounded-lg lg:rounded-xl">
                  <button
                    onClick={() => setSelectedCategoryFilter("all")}
                    className={`py-0.5 lg:py-1 px-1 lg:px-1.5 text-[7px] lg:text-xs font-semibold rounded-lg transition-all cursor-pointer text-center ${
                      selectedCategoryFilter === "all"
                        ? "bg-zinc-800 text-white shadow-sm"
                        : "text-zinc-500 hover:text-zinc-300"
                    }`}
                  >
                    All
                  </button>
                  <button
                    onClick={() => setSelectedCategoryFilter("mining")}
                    className={`py-0.5 lg:py-1 px-1 lg:px-1.5 text-[7px] lg:text-xs font-semibold rounded-lg transition-all cursor-pointer text-center ${
                      selectedCategoryFilter === "mining"
                        ? "bg-red-500/20 text-red-400 border border-red-500/30"
                        : "text-zinc-500 hover:text-zinc-300"
                    }`}
                  >
                    Mining
                  </button>
                  <button
                    onClick={() => setSelectedCategoryFilter("pollution")}
                    className={`py-0.5 lg:py-1 px-1 lg:px-1.5 text-[7px] lg:text-xs font-semibold rounded-lg transition-all cursor-pointer text-center ${
                      selectedCategoryFilter === "pollution"
                        ? "bg-amber-500/20 text-amber-400 border border-amber-500/30"
                        : "text-zinc-500 hover:text-zinc-300"
                    }`}
                  >
                    Pollution
                  </button>
                  <button
                    onClick={() => setSelectedCategoryFilter("flooding")}
                    className={`py-0.5 lg:py-1 px-1 lg:px-1.5 text-[7px] lg:text-xs font-semibold rounded-lg transition-all cursor-pointer text-center ${
                      selectedCategoryFilter === "flooding"
                        ? "bg-blue-500/20 text-blue-400 border border-blue-500/30"
                        : "text-zinc-500 hover:text-zinc-300"
                    }`}
                  >
                    Flood
                  </button>
                </div>
              </div>

              {!isReporting ? (
                /* Action Box when not reporting */
                <div className="bg-zinc-900/80 border border-white/10 rounded-lg lg:rounded-2xl p-2.5 lg:p-4 shadow-xl">
                  <h2 className="text-xs lg:text-sm font-semibold text-zinc-200 flex items-center gap-1.5 lg:gap-2">
                    <AlertCircle
                      className="text-emerald-500 w-3.5 lg:w-4.5 h-3.5 lg:h-4.5"
                      size={14}
                    />
                    Report Activity
                  </h2>
                  <p className="text-[10px] lg:text-xs text-zinc-400 mt-1.5 lg:mt-2 mb-2 lg:mb-4 leading-relaxed">
                    Submit reports of mining, pollution, or floods.
                  </p>
                  <button
                    onClick={() => setIsReporting(true)}
                    className="w-full bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white text-xs lg:text-sm font-semibold py-1.5 lg:py-2.5 px-3 lg:px-4 rounded-lg lg:rounded-xl transition-all duration-200 shadow-lg shadow-emerald-900/20 cursor-pointer"
                  >
                    Submit New Report
                  </button>
                </div>
              ) : (
                /* Form Box when reporting */
                <form
                  onSubmit={handleSubmit}
                  className="bg-zinc-900 border border-emerald-500/20 rounded-lg lg:rounded-2xl p-2.5 lg:p-4 shadow-2xl space-y-2.5 lg:space-y-4 animate-fadeIn"
                >
                  <div className="flex items-center justify-between border-b border-white/5 pb-1.5 lg:pb-2">
                    <h2 className="text-xs lg:text-sm font-semibold text-emerald-400 flex items-center gap-1 lg:gap-2">
                      <Activity
                        size={14}
                        className="w-3.5 lg:w-4.5 h-3.5 lg:h-4.5"
                      />
                      New Report
                    </h2>
                    <button
                      type="button"
                      onClick={() => {
                        setIsReporting(false);
                        setSelectedLocation(null);
                      }}
                      className="text-[10px] lg:text-xs text-zinc-500 hover:text-zinc-300 cursor-pointer"
                    >
                      Cancel
                    </button>
                  </div>

                  {/* Type Select */}
                  <div className="space-y-1.5">
                    <label className="text-[10px] uppercase font-bold tracking-wider text-zinc-400">
                      Report Category
                    </label>
                    <select
                      value={reportType}
                      onChange={(e) => setReportType(e.target.value as any)}
                      className="w-full bg-zinc-800 border border-white/10 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
                    >
                      <option value="mining">Illegal Mining (Galamsey)</option>
                      <option value="pollution">River/Water Pollution</option>
                      <option value="flooding">Downstream Flooding</option>
                    </select>
                  </div>

                  {/* Location selection info */}
                  <div className="space-y-1.5">
                    <label className="text-[10px] uppercase font-bold tracking-wider text-zinc-400">
                      Location Coordinates
                    </label>
                    {selectedLocation ? (
                      <div className="flex items-center gap-2 text-xs bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 p-2.5 rounded-xl">
                        <MapPin size={14} />
                        <span>
                          Lat: {selectedLocation.latitude.toFixed(5)}, Lon:{" "}
                          {selectedLocation.longitude.toFixed(5)}
                        </span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 text-xs bg-red-500/10 border border-red-500/20 text-red-400 p-2.5 rounded-xl">
                        <MapPin size={14} className="animate-bounce" />
                        <span>Click map inside Ghana to set location.</span>
                      </div>
                    )}
                  </div>

                  {/* Description */}
                  <div className="space-y-1.5">
                    <label className="text-[10px] uppercase font-bold tracking-wider text-zinc-400">
                      Description / Details
                    </label>
                    <textarea
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      placeholder="Describe the activity (e.g., active excavation, muddy water, farm flooding...)"
                      rows={3}
                      required
                      className="w-full bg-zinc-800 border border-white/10 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-emerald-500 placeholder-zinc-500 resize-none"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={
                      submitting || !selectedLocation || !description.trim()
                    }
                    className="w-full bg-emerald-600 hover:bg-emerald-700 disabled:bg-zinc-800 disabled:text-zinc-500 disabled:cursor-not-allowed text-white text-sm font-semibold py-2.5 px-4 rounded-xl transition-all duration-200 flex items-center justify-center gap-2 cursor-pointer"
                  >
                    {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
                    {submitting ? "Submitting..." : "Submit Report"}
                  </button>
                </form>
              )}

              {/* Recent Alerts List */}
              <div className="space-y-2 lg:space-y-3">
                <h3 className="text-[10px] lg:text-xs font-bold uppercase tracking-wider text-zinc-400 flex items-center gap-1 lg:gap-2">
                  <Calendar size={12} className="lg:w-[14px] lg:h-[14px]" />
                  Recent ({filteredReports.length})
                </h3>

                {loading ? (
                  <div className="flex flex-col items-center justify-center py-8 lg:py-12 text-zinc-500 space-y-1.5 lg:space-y-2">
                    <Loader2 className="w-5 lg:w-6 h-5 lg:h-6 animate-spin text-emerald-500" />
                    <span className="text-[10px] lg:text-xs">
                      Fetching alerts...
                    </span>
                  </div>
                ) : filteredReports.length === 0 ? (
                  <div className="text-center py-8 lg:py-12 text-xs text-zinc-500 border border-dashed border-white/5 rounded-lg lg:rounded-xl">
                    No active alerts match this filter.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {filteredReports.map((report) => {
                      const isFocused = focusedReport?.id === report.id;

                      // Category specific styling
                      let cardStyles = "";
                      let accentColor = "";
                      let badgeText = "";
                      let icon = null;

                      if (report.type === "mining") {
                        cardStyles = isFocused
                          ? "bg-red-500/10 border-red-500/60 shadow-lg shadow-red-950/20 ring-1 ring-red-500/30"
                          : "bg-zinc-900/40 border-white/5 hover:border-red-500/30 hover:bg-red-950/5";
                        accentColor = "bg-red-500";
                        badgeText = "Illegal Mining";
                        icon = (
                          <ShieldAlert className="text-red-500 w-4 lg:w-5 h-4 lg:h-5 flex-shrink-0 group-hover:animate-pulse" />
                        );
                      } else if (report.type === "pollution") {
                        cardStyles = isFocused
                          ? "bg-amber-500/10 border-amber-500/60 shadow-lg shadow-amber-950/20 ring-1 ring-amber-500/30"
                          : "bg-zinc-900/40 border-white/5 hover:border-amber-500/30 hover:bg-amber-950/5";
                        accentColor = "bg-amber-500";
                        badgeText = "River Pollution";
                        icon = (
                          <AlertTriangle className="text-amber-500 w-4 lg:w-5 h-4 lg:h-5 flex-shrink-0 group-hover:scale-110 transition-transform" />
                        );
                      } else {
                        cardStyles = isFocused
                          ? "bg-blue-500/10 border-blue-500/60 shadow-lg shadow-blue-950/20 ring-1 ring-blue-500/30"
                          : "bg-zinc-900/40 border-white/5 hover:border-blue-500/30 hover:bg-blue-950/5";
                        accentColor = "bg-blue-500";
                        badgeText = "Water Flooding";
                        icon = (
                          <Droplets className="text-blue-500 w-4 lg:w-5 h-4 lg:h-5 flex-shrink-0 group-hover:scale-110 transition-transform" />
                        );
                      }

                      return (
                        <div
                          key={report.id}
                          onClick={() => {
                            setFocusedReport(report);
                            setFocusedZone(null);
                          }}
                          className={`cursor-pointer border rounded-lg lg:rounded-xl p-2.5 lg:p-4 transition-all duration-300 shadow-md group relative overflow-hidden ${cardStyles}`}
                        >
                          {/* Status accent border */}
                          <div
                            className={`absolute top-0 left-0 bottom-0 w-1 ${accentColor}`}
                          />

                          <div className="flex items-start gap-2 lg:gap-3 pl-0.5 lg:pl-1">
                            {icon}
                            <div className="space-y-1 lg:space-y-1.5 min-w-0 flex-1">
                              <div className="flex items-center justify-between gap-1 lg:gap-2">
                                <span
                                  className="text-[8px] lg:text-[10px] font-extrabold uppercase tracking-wider"
                                  style={{
                                    color:
                                      report.type === "mining"
                                        ? "#ef4444"
                                        : report.type === "pollution"
                                          ? "#f59e0b"
                                          : "#3b82f6",
                                  }}
                                >
                                  {badgeText}
                                </span>
                                <span className="text-[7px] lg:text-[10px] text-zinc-500 font-medium whitespace-nowrap">
                                  {formatTimeAgo(report.created_at)}
                                </span>
                              </div>
                              <p className="text-xs lg:text-sm text-zinc-200 leading-snug break-words">
                                {report.description}
                              </p>
                              <div className="flex items-center justify-between gap-1 lg:gap-2 pt-0.5 lg:pt-1 border-t border-white/5">
                                <span
                                  className={`text-[7px] lg:text-[9px] px-1.5 lg:px-2 py-0.5 rounded-full font-bold border uppercase tracking-wider ${
                                    report.status === "verified"
                                      ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                                      : report.status === "dismissed"
                                        ? "bg-zinc-500/10 text-zinc-400 border-zinc-500/20"
                                        : "bg-amber-500/10 text-amber-400 border-amber-500/20"
                                  }`}
                                >
                                  {report.status}
                                </span>
                                <span className="text-[7px] lg:text-[9px] text-zinc-400 font-mono truncate">
                                  {report.latitude.toFixed(3)},{" "}
                                  {report.longitude.toFixed(3)}
                                </span>
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </>
          ) : activeTab === "flood_risk" ? (
            /* Flood Risk Assessment Tab Content */
            <div className="space-y-2.5 lg:space-y-4">
              <div className="bg-zinc-900 border border-white/5 rounded-lg lg:rounded-2xl p-2.5 lg:p-4 shadow-xl">
                <h2 className="text-xs lg:text-sm font-semibold text-zinc-200 flex items-center gap-1 lg:gap-2">
                  <Activity
                    className="text-blue-500 animate-pulse w-3.5 lg:w-4.5 h-3.5 lg:h-4.5"
                    size={14}
                  />
                  AI Assessment
                </h2>
                <p className="text-[10px] lg:text-xs text-zinc-400 mt-1.5 lg:mt-2 leading-relaxed">
                  Community vulnerability scores based on environmental data.
                </p>

                {/* Sub-toggle Row */}
                <div className="grid grid-cols-3 gap-0.5 lg:gap-1 bg-zinc-950 p-0.5 lg:p-1 border border-white/5 rounded-lg lg:rounded-xl mt-2 lg:mt-3">
                  <button
                    onClick={() => setActiveRiskType("flood")}
                    className={`py-0.5 lg:py-1 text-[7px] lg:text-[10px] font-bold rounded-lg transition-all cursor-pointer text-center ${activeRiskType === "flood" ? "bg-blue-600 text-white shadow-sm" : "text-zinc-500 hover:text-zinc-300"}`}
                  >
                    Flood
                  </button>
                  <button
                    onClick={() => setActiveRiskType("mining")}
                    className={`py-0.5 lg:py-1 text-[7px] lg:text-[10px] font-bold rounded-lg transition-all cursor-pointer text-center ${activeRiskType === "mining" ? "bg-red-600 text-white shadow-sm" : "text-zinc-500 hover:text-zinc-300"}`}
                  >
                    Mining
                  </button>
                  <button
                    onClick={() => setActiveRiskType("pollution")}
                    className={`py-1 text-[10px] font-bold rounded-lg transition-all cursor-pointer text-center ${activeRiskType === "pollution" ? "bg-amber-600 text-white shadow-sm" : "text-zinc-500 hover:text-zinc-300"}`}
                  >
                    Pollution
                  </button>
                </div>
              </div>

              <div className="space-y-2 lg:space-y-3">
                <h3 className="text-[10px] lg:text-xs font-bold uppercase tracking-wider text-zinc-400 flex items-center gap-1 lg:gap-2">
                  <Activity size={12} className="lg:w-[14px] lg:h-[14px]" />{" "}
                  Communities ({floodRisks.length})
                </h3>
                {floodRisks.length === 0 ? (
                  <div className="text-center py-8 lg:py-12 text-xs text-zinc-500 border border-dashed border-white/5 rounded-lg lg:rounded-xl">
                    No risk profiles found. Run AI script.
                  </div>
                ) : (
                  <div className="space-y-2 lg:space-y-3">
                    {floodRisks.map((risk) => {
                      const isFocused = focusedZone?.id === risk.id;
                      let score = risk.risk_score;
                      let status = risk.status;
                      if (activeRiskType === "mining") {
                        score = risk.mining_risk_score ?? 0;
                        status = risk.mining_status ?? "low";
                      } else if (activeRiskType === "pollution") {
                        score = risk.pollution_risk_score ?? 0;
                        status = risk.pollution_status ?? "low";
                      }

                      const cardStyles = isFocused
                        ? status === "high"
                          ? "bg-red-500/10 border-red-500/60 ring-1 ring-red-500/30"
                          : status === "medium"
                            ? "bg-amber-500/10 border-amber-500/60 ring-1 ring-amber-500/30"
                            : "bg-blue-500/10 border-blue-500/60 ring-1 ring-blue-500/30"
                        : status === "high"
                          ? "bg-zinc-900/40 border-white/5 hover:border-red-500/30"
                          : status === "medium"
                            ? "bg-zinc-900/40 border-white/5 hover:border-amber-500/30"
                            : "bg-zinc-900/40 border-white/5 hover:border-blue-500/30";
                      const badgeColor =
                        status === "high"
                          ? "text-red-400 border-red-500/20 bg-red-500/10"
                          : status === "medium"
                            ? "text-amber-400 border-amber-500/20 bg-amber-500/10"
                            : "text-emerald-400 border-emerald-500/20 bg-emerald-500/10";
                      const riskText =
                        status === "high"
                          ? "CRITICAL"
                          : status === "medium"
                            ? "MODERATE"
                            : "LOW";
                      const accentBar =
                        status === "high"
                          ? "bg-red-500"
                          : status === "medium"
                            ? "bg-amber-500"
                            : "bg-emerald-500";
                      const scoreColor =
                        status === "high"
                          ? "text-red-500"
                          : status === "medium"
                            ? "text-amber-500"
                            : "text-emerald-500";
                      const labelText =
                        activeRiskType === "mining"
                          ? "Proximity Index"
                          : activeRiskType === "pollution"
                            ? "Sediment Index"
                            : "Flood Factor";

                      return (
                        <div
                          key={risk.id}
                          onClick={() => {
                            setFocusedZone(risk);
                            setFocusedReport(null);
                          }}
                          className={`cursor-pointer border rounded-lg lg:rounded-xl p-2.5 lg:p-4 transition-all duration-300 shadow-md group relative overflow-hidden ${cardStyles}`}
                        >
                          <div
                            className={`absolute top-0 left-0 bottom-0 w-1 ${accentBar}`}
                          />
                          <div className="flex items-start justify-between gap-1.5 lg:gap-2 pl-0.5 lg:pl-1">
                            <div className="space-y-1 lg:space-y-1.5 min-w-0 flex-1">
                              <div className="flex items-center justify-between gap-1 lg:gap-2">
                                <span className="text-xs lg:text-sm font-bold text-white group-hover:text-blue-400 transition-colors truncate">
                                  {risk.community}
                                </span>
                                <span
                                  className={`text-[7px] lg:text-[9px] px-1.5 lg:px-2 py-0.5 rounded-full font-bold border uppercase tracking-wider whitespace-nowrap ${badgeColor}`}
                                >
                                  {riskText}
                                </span>
                              </div>
                              <div className="flex items-center justify-between gap-2 lg:gap-4 pt-0.5 lg:pt-1.5 border-t border-white/5">
                                <div className="space-y-0.5">
                                  <span className="text-[7px] lg:text-[9px] text-zinc-500 block uppercase font-medium">
                                    {labelText}
                                  </span>
                                  <span
                                    className={`text-sm lg:text-base font-extrabold ${scoreColor}`}
                                  >
                                    {(score * 100).toFixed(0)}%
                                  </span>
                                </div>
                                <div className="text-right">
                                  <span className="text-[7px] lg:text-[9px] text-zinc-500 block uppercase font-medium">
                                    Loc
                                  </span>
                                  <span className="text-[7px] lg:text-[10px] text-zinc-400 font-mono">
                                    {risk.latitude.toFixed(2)},{" "}
                                    {risk.longitude.toFixed(2)}
                                  </span>
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          ) : (
            /* Location Inspect Tab Content */
            <div className="space-y-2.5 lg:space-y-4">
              <div className="bg-zinc-900 border border-white/5 rounded-lg lg:rounded-2xl p-2.5 lg:p-4 shadow-xl">
                <h2 className="text-xs lg:text-sm font-semibold text-zinc-200 flex items-center gap-1 lg:gap-2">
                  <Search
                    className="text-violet-400 w-3.5 lg:w-4 h-3.5 lg:h-4"
                    size={14}
                  />
                  Location Inspector
                </h2>
                <p className="text-[10px] lg:text-xs text-zinc-400 mt-1 lg:mt-1.5 leading-relaxed">
                  Search any town in Ghana for weather & risk scores.
                </p>
                <form
                  onSubmit={handleLocationSearch}
                  className="mt-2 lg:mt-3 flex gap-1.5 lg:gap-2"
                >
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="e.g. Tarkwa, Kumasi..."
                    className="flex-1 bg-zinc-950 border border-white/10 focus:border-violet-500/60 rounded-lg lg:rounded-xl px-2 lg:px-3 py-1.5 lg:py-2 text-xs lg:text-sm text-white placeholder-zinc-600 outline-none transition-all"
                  />
                  <button
                    type="submit"
                    disabled={searchLoading || !searchQuery.trim()}
                    className="bg-violet-600 hover:bg-violet-500 disabled:opacity-50 disabled:cursor-not-allowed text-white px-2 lg:px-3 py-1.5 lg:py-2 rounded-lg lg:rounded-xl text-[10px] lg:text-xs font-bold transition-all flex items-center gap-1 lg:gap-1.5 cursor-pointer"
                  >
                    {searchLoading ? (
                      <Loader2
                        size={12}
                        className="lg:w-[14px] lg:h-[14px] animate-spin"
                      />
                    ) : (
                      <Search size={12} className="lg:w-[14px] lg:h-[14px]" />
                    )}
                  </button>
                </form>
              </div>

              {searchError && (
                <div className="bg-red-500/10 border border-red-500/30 rounded-lg lg:rounded-xl p-2 lg:p-3 text-xs text-red-400 flex items-start gap-1.5 lg:gap-2">
                  <AlertCircle
                    size={12}
                    className="lg:w-[14px] lg:h-[14px] flex-shrink-0 mt-0.5"
                  />
                  {searchError}
                </div>
              )}

              {searchLoading && (
                <div className="space-y-2 lg:space-y-3">
                  {[1, 2, 3].map((i) => (
                    <div
                      key={i}
                      className="bg-zinc-900/50 border border-white/5 rounded-lg lg:rounded-xl p-2.5 lg:p-4 animate-pulse"
                    >
                      <div className="h-2 lg:h-3 bg-zinc-800 rounded w-1/2 mb-1.5 lg:mb-2" />
                      <div className="h-2 bg-zinc-800 rounded w-3/4" />
                    </div>
                  ))}
                </div>
              )}

              {searchResult && !searchLoading && (
                <div className="space-y-3">
                  <div className="bg-violet-500/10 border border-violet-500/20 rounded-xl p-3">
                    <div className="flex items-start gap-2">
                      <MapPin
                        size={14}
                        className="text-violet-400 flex-shrink-0 mt-0.5"
                      />
                      <div>
                        <p className="text-xs font-bold text-white leading-tight">
                          {searchResult.name}
                        </p>
                        <p className="text-[10px] text-zinc-500 font-mono mt-0.5">
                          {searchResult.latitude.toFixed(4)},{" "}
                          {searchResult.longitude.toFixed(4)}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="bg-zinc-900 border border-white/5 rounded-xl p-3">
                    <span className="text-[10px] uppercase font-bold tracking-wider text-zinc-400">
                      Live Weather
                    </span>
                    <div className="grid grid-cols-3 gap-2 mt-2">
                      <div className="text-center">
                        <Droplets
                          size={16}
                          className="text-blue-400 mx-auto mb-1"
                        />
                        <p className="text-xs font-bold text-white">
                          {searchResult.rainfall.toFixed(1)}mm
                        </p>
                        <p className="text-[9px] text-zinc-500">7-day rain</p>
                      </div>
                      <div className="text-center">
                        <Thermometer
                          size={16}
                          className="text-orange-400 mx-auto mb-1"
                        />
                        <p className="text-xs font-bold text-white">
                          {searchResult.temperature.toFixed(1)}°C
                        </p>
                        <p className="text-[9px] text-zinc-500">Temperature</p>
                      </div>
                      <div className="text-center">
                        <Wind
                          size={16}
                          className="text-zinc-400 mx-auto mb-1"
                        />
                        <p className="text-xs font-bold text-white">
                          {searchResult.windspeed.toFixed(0)} km/h
                        </p>
                        <p className="text-[9px] text-zinc-500">Wind</p>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <span className="text-[10px] uppercase font-bold tracking-wider text-zinc-400">
                      Risk Assessment
                    </span>
                    {(
                      [
                        {
                          label: "Flood Risk",
                          score: searchResult.floodRisk,
                          status: searchResult.floodStatus,
                          color: "blue",
                        },
                        {
                          label: "Mining Proximity",
                          score: searchResult.miningRisk,
                          status: searchResult.miningStatus,
                          color: "red",
                        },
                        {
                          label: "River Pollution",
                          score: searchResult.pollutionRisk,
                          status: searchResult.pollutionStatus,
                          color: "amber",
                        },
                      ] as const
                    ).map(({ label, score, status, color }) => {
                      const barColor =
                        color === "red"
                          ? "bg-red-500"
                          : color === "amber"
                            ? "bg-amber-500"
                            : "bg-blue-500";
                      const textColor =
                        color === "red"
                          ? "text-red-400"
                          : color === "amber"
                            ? "text-amber-400"
                            : "text-blue-400";
                      const badgeStyles =
                        status === "high"
                          ? "bg-red-500/10 text-red-400 border-red-500/20"
                          : status === "medium"
                            ? "bg-amber-500/10 text-amber-400 border-amber-500/20"
                            : "bg-emerald-500/10 text-emerald-400 border-emerald-500/20";
                      return (
                        <div
                          key={label}
                          className="bg-zinc-900/60 border border-white/5 rounded-xl p-3 space-y-2"
                        >
                          <div className="flex items-center justify-between">
                            <span className="text-[11px] font-semibold text-zinc-300">
                              {label}
                            </span>
                            <div className="flex items-center gap-1.5">
                              <span
                                className={`text-[9px] px-1.5 py-0.5 rounded-full font-bold border uppercase ${badgeStyles}`}
                              >
                                {status} risk
                              </span>
                              <span
                                className={`text-sm font-black ${textColor}`}
                              >
                                {(score * 100).toFixed(0)}%
                              </span>
                            </div>
                          </div>
                          <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full transition-all duration-700 ${barColor}`}
                              style={{ width: `${(score * 100).toFixed(0)}%` }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  <div className="bg-zinc-900 border border-white/5 rounded-xl p-3 text-[10px] text-zinc-400 flex items-center justify-between">
                    <span>Nearest galamsey report:</span>
                    <span className="font-bold text-white">
                      {searchResult.miningDistance > 200
                        ? "None reported"
                        : `${searchResult.miningDistance.toFixed(1)} km away`}
                    </span>
                  </div>

                  <button
                    onClick={() =>
                      setSearchFocused({
                        latitude: searchResult.latitude,
                        longitude: searchResult.longitude,
                      })
                    }
                    className="w-full bg-violet-600/20 hover:bg-violet-600/30 border border-violet-500/30 text-violet-300 text-xs font-semibold py-2.5 rounded-xl transition-all flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <Crosshair size={13} /> Center map on this location
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </aside>

      {/* Main Content - Map */}
      <main className="flex-1 relative p-4 bg-zinc-950 min-h-[60vh] lg:min-h-screen w-full">
        <Map
          reports={filteredReports}
          isReporting={isReporting}
          selectedLocation={selectedLocation}
          onSelectLocation={handleSelectLocation}
          userLocation={userLocation}
          focusedReport={focusedReport}
          focusedZone={focusedZone}
          floodRisks={floodRisks}
          activeRiskType={activeRiskType}
          searchFocused={searchFocused}
          theme="dark"
        />
      </main>
    </div>
  );
}
