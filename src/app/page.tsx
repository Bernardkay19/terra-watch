'use client';

import * as React from 'react';
import dynamic from 'next/dynamic';
import { AlertCircle, Activity, Droplets, MapPin, Loader2, Calendar, ShieldAlert, AlertTriangle } from 'lucide-react';
import { supabase } from '../lib/supabase';

const Map = dynamic(() => import('@/components/Map'), { 
  ssr: false, 
  loading: () => (
    <div className="flex h-full w-full items-center justify-center bg-zinc-900 text-zinc-500 rounded-xl">
      Loading Map...
    </div>
  ) 
});

interface Report {
  id: string;
  type: 'mining' | 'pollution' | 'flooding';
  description: string;
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

export default function Home() {
  const [reports, setReports] = React.useState<Report[]>([]);
  const [floodRisks, setFloodRisks] = React.useState<FloodRiskZone[]>([]);
  const [loading, setLoading] = React.useState<boolean>(true);
  const [isReporting, setIsReporting] = React.useState<boolean>(false);
  const [submitting, setSubmitting] = React.useState<boolean>(false);
  const [selectedLocation, setSelectedLocation] = React.useState<{ latitude: number; longitude: number } | null>(null);
  const [userLocation, setUserLocation] = React.useState<{ latitude: number; longitude: number } | null>(null);
  const [focusedReport, setFocusedReport] = React.useState<Report | null>(null);
  const [focusedZone, setFocusedZone] = React.useState<FloodRiskZone | null>(null);
  const [selectedCategoryFilter, setSelectedCategoryFilter] = React.useState<string>('all');
  const [activeTab, setActiveTab] = React.useState<'reports' | 'flood_risk'>('reports');
  const [activeRiskType, setActiveRiskType] = React.useState<'flood' | 'mining' | 'pollution'>('flood');

  // Form State
  const [reportType, setReportType] = React.useState<'mining' | 'pollution' | 'flooding'>('mining');
  const [description, setDescription] = React.useState<string>('');

  // Get User Location by Default
  React.useEffect(() => {
    if (typeof window !== 'undefined' && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const { latitude, longitude } = position.coords;
          setUserLocation({ latitude, longitude });
        },
        (error) => {
          console.warn('Geolocation access denied or error:', error);
        },
        { enableHighAccuracy: true, timeout: 10000 }
      );
    }
  }, []);

  // Pre-fill location coordinates for report if user is in Ghana
  React.useEffect(() => {
    if (isReporting && !selectedLocation && userLocation) {
      const { latitude, longitude } = userLocation;
      if (longitude >= -3.79 && longitude <= 1.25 && latitude >= 4.68 && latitude <= 11.2) {
        setSelectedLocation({ latitude, longitude });
      }
    }
  }, [isReporting, userLocation, selectedLocation]);

  const fetchReports = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('reports')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setReports(data || []);
    } catch (err) {
      console.error('Error fetching reports:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchFloodRisks = async () => {
    try {
      const { data, error } = await supabase
        .from('flood_risk')
        .select('*')
        .order('risk_score', { ascending: false });

      if (error) throw error;
      setFloodRisks(data || []);
    } catch (err) {
      console.error('Error fetching flood risks:', err);
    }
  };

  React.useEffect(() => {
    fetchReports();
    fetchFloodRisks();
  }, []);

  const handleSelectLocation = (lat: number, lon: number) => {
    setSelectedLocation({ latitude: lat, longitude: lon });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedLocation || !description.trim()) return;

    try {
      setSubmitting(true);
      const { error } = await supabase
        .from('reports')
        .insert([
          {
            type: reportType,
            description: description.trim(),
            latitude: selectedLocation.latitude,
            longitude: selectedLocation.longitude,
            status: 'pending'
          }
        ]);

      if (error) throw error;

      // Reset state and refresh
      setIsReporting(false);
      setDescription('');
      setSelectedLocation(null);
      await fetchReports();
    } catch (err) {
      console.error('Error submitting report:', err);
      alert('Failed to submit report. Please verify your Supabase database table `reports` has been created by running `supabase_schema.sql` in your SQL Editor.');
    } finally {
      setSubmitting(false);
    }
  };

  const getAlertIcon = (type: string) => {
    switch (type) {
      case 'mining': return <ShieldAlert className="text-red-500 w-5 h-5 flex-shrink-0" />;
      case 'pollution': return <AlertTriangle className="text-amber-500 w-5 h-5 flex-shrink-0" />;
      case 'flooding': return <Droplets className="text-blue-500 w-5 h-5 flex-shrink-0" />;
      default: return null;
    }
  };

  const formatTimeAgo = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    return date.toLocaleDateString();
  };

  const miningCount = reports.filter(r => r.type === 'mining').length;
  const pollutionCount = reports.filter(r => r.type === 'pollution').length;
  const floodingCount = reports.filter(r => r.type === 'flooding').length;

  const filteredReports = reports.filter(report => {
    if (selectedCategoryFilter === 'all') return true;
    return report.type === selectedCategoryFilter;
  });

  return (
    <div className="flex h-screen bg-zinc-950 text-white overflow-hidden font-sans">
      {/* Sidebar */}
      <aside className="w-96 border-r border-white/10 flex flex-col bg-zinc-900/50 backdrop-blur-xl">
        {/* Header */}
        <div className="p-6 border-b border-white/10">
          <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2">
            <Activity className="text-emerald-500 w-6 h-6 animate-pulse" />
            Terra Watch
          </h1>
          <p className="text-sm text-zinc-400 mt-1">
            Ghana Illegal Mining & Flood Control
          </p>
        </div>

        {/* Scrollable content area */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Stats Summary Panel */}
          <div className="grid grid-cols-3 gap-2.5">
            <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-2 text-center transition-all hover:bg-red-500/15">
              <span className="text-[10px] font-bold text-red-400 block uppercase tracking-wider animate-pulse">Mining</span>
              <span className="text-xl font-extrabold text-red-500">{miningCount}</span>
            </div>
            <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-2 text-center transition-all hover:bg-amber-500/15">
              <span className="text-[10px] font-bold text-amber-400 block uppercase tracking-wider">Pollution</span>
              <span className="text-xl font-extrabold text-amber-500">{pollutionCount}</span>
            </div>
            <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-2 text-center transition-all hover:bg-blue-500/15">
              <span className="text-[10px] font-bold text-blue-400 block uppercase tracking-wider">Flooding</span>
              <span className="text-xl font-extrabold text-blue-500">{floodingCount}</span>
            </div>
          </div>

          {/* Tab Navigation */}
          <div className="flex bg-zinc-950 p-1 border border-white/5 rounded-xl">
            <button
              onClick={() => setActiveTab('reports')}
              className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all cursor-pointer text-center ${
                activeTab === 'reports'
                  ? 'bg-emerald-600 text-white shadow-md'
                  : 'text-zinc-500 hover:text-zinc-300'
              }`}
            >
              Citizen Reports
            </button>
            <button
              onClick={() => setActiveTab('flood_risk')}
              className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all cursor-pointer text-center ${
                activeTab === 'flood_risk'
                  ? 'bg-blue-600 text-white shadow-md'
                  : 'text-zinc-500 hover:text-zinc-300'
              }`}
            >
              Flood Risk
            </button>
          </div>

          {activeTab === 'reports' ? (
            <>
              {/* Category Filter Tabs */}
              <div className="space-y-2">
                <label className="text-[10px] uppercase font-bold tracking-wider text-zinc-400">Filter Alerts</label>
                <div className="grid grid-cols-4 gap-1 bg-zinc-950 p-1 border border-white/5 rounded-xl">
                  <button
                    onClick={() => setSelectedCategoryFilter('all')}
                    className={`py-1 px-1.5 text-xs font-semibold rounded-lg transition-all cursor-pointer text-center ${
                      selectedCategoryFilter === 'all'
                        ? 'bg-zinc-800 text-white shadow-sm'
                        : 'text-zinc-500 hover:text-zinc-300'
                    }`}
                  >
                    All
                  </button>
                  <button
                    onClick={() => setSelectedCategoryFilter('mining')}
                    className={`py-1 px-1.5 text-xs font-semibold rounded-lg transition-all cursor-pointer text-center ${
                      selectedCategoryFilter === 'mining'
                        ? 'bg-red-500/20 text-red-400 border border-red-500/30'
                        : 'text-zinc-500 hover:text-zinc-300'
                    }`}
                  >
                    Mining
                  </button>
                  <button
                    onClick={() => setSelectedCategoryFilter('pollution')}
                    className={`py-1 px-1.5 text-xs font-semibold rounded-lg transition-all cursor-pointer text-center ${
                      selectedCategoryFilter === 'pollution'
                        ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                        : 'text-zinc-500 hover:text-zinc-300'
                    }`}
                  >
                    Pollution
                  </button>
                  <button
                    onClick={() => setSelectedCategoryFilter('flooding')}
                    className={`py-1 px-1.5 text-xs font-semibold rounded-lg transition-all cursor-pointer text-center ${
                      selectedCategoryFilter === 'flooding'
                        ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                        : 'text-zinc-500 hover:text-zinc-300'
                    }`}
                  >
                    Flooding
                  </button>
                </div>
              </div>

              {!isReporting ? (
                /* Action Box when not reporting */
                <div className="bg-zinc-900/80 border border-white/10 rounded-2xl p-4 shadow-xl">
                  <h2 className="text-sm font-semibold text-zinc-200 flex items-center gap-2">
                    <AlertCircle className="text-emerald-500" size={18} />
                    Report Activity
                  </h2>
                  <p className="text-xs text-zinc-400 mt-2 mb-4 leading-relaxed">
                    Empower your community. Submit reports of illegal mining (galamsey), toxic river pollution, or localized flood risk.
                  </p>
                  <button 
                    onClick={() => setIsReporting(true)}
                    className="w-full bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white text-sm font-semibold py-2.5 px-4 rounded-xl transition-all duration-200 shadow-lg shadow-emerald-900/20 cursor-pointer"
                  >
                    Submit New Report
                  </button>
                </div>
              ) : (
                /* Form Box when reporting */
                <form onSubmit={handleSubmit} className="bg-zinc-900 border border-emerald-500/20 rounded-2xl p-4 shadow-2xl space-y-4 animate-fadeIn">
                  <div className="flex items-center justify-between border-b border-white/5 pb-2">
                    <h2 className="text-sm font-semibold text-emerald-400 flex items-center gap-2">
                      <Activity size={18} />
                      New Citizen Report
                    </h2>
                    <button 
                      type="button"
                      onClick={() => {
                        setIsReporting(false);
                        setSelectedLocation(null);
                      }}
                      className="text-xs text-zinc-500 hover:text-zinc-300 cursor-pointer"
                    >
                      Cancel
                    </button>
                  </div>

                  {/* Type Select */}
                  <div className="space-y-1.5">
                    <label className="text-[10px] uppercase font-bold tracking-wider text-zinc-400">Report Category</label>
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
                    <label className="text-[10px] uppercase font-bold tracking-wider text-zinc-400">Location Coordinates</label>
                    {selectedLocation ? (
                      <div className="flex items-center gap-2 text-xs bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 p-2.5 rounded-xl">
                        <MapPin size={14} />
                        <span>Lat: {selectedLocation.latitude.toFixed(5)}, Lon: {selectedLocation.longitude.toFixed(5)}</span>
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
                    <label className="text-[10px] uppercase font-bold tracking-wider text-zinc-400">Description / Details</label>
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
                    disabled={submitting || !selectedLocation || !description.trim()}
                    className="w-full bg-emerald-600 hover:bg-emerald-700 disabled:bg-zinc-800 disabled:text-zinc-500 disabled:cursor-not-allowed text-white text-sm font-semibold py-2.5 px-4 rounded-xl transition-all duration-200 flex items-center justify-center gap-2 cursor-pointer"
                  >
                    {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
                    {submitting ? 'Submitting...' : 'Submit Report'}
                  </button>
                </form>
              )}

              {/* Recent Alerts List */}
              <div className="space-y-3">
                <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-400 flex items-center gap-2">
                  <Calendar size={14} />
                  Recent Alerts ({filteredReports.length})
                </h3>
                
                {loading ? (
                  <div className="flex flex-col items-center justify-center py-12 text-zinc-500 space-y-2">
                    <Loader2 className="w-6 h-6 animate-spin text-emerald-500" />
                    <span className="text-xs">Fetching alerts...</span>
                  </div>
                ) : filteredReports.length === 0 ? (
                  <div className="text-center py-12 text-xs text-zinc-500 border border-dashed border-white/5 rounded-xl">
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
                      
                      if (report.type === 'mining') {
                        cardStyles = isFocused 
                          ? "bg-red-500/10 border-red-500/60 shadow-lg shadow-red-950/20 ring-1 ring-red-500/30" 
                          : "bg-zinc-900/40 border-white/5 hover:border-red-500/30 hover:bg-red-950/5";
                        accentColor = "bg-red-500";
                        badgeText = "Illegal Mining";
                        icon = <ShieldAlert className="text-red-500 w-5 h-5 flex-shrink-0 group-hover:animate-pulse" />;
                      } else if (report.type === 'pollution') {
                        cardStyles = isFocused
                          ? "bg-amber-500/10 border-amber-500/60 shadow-lg shadow-amber-950/20 ring-1 ring-amber-500/30"
                          : "bg-zinc-900/40 border-white/5 hover:border-amber-500/30 hover:bg-amber-950/5";
                        accentColor = "bg-amber-500";
                        badgeText = "River Pollution";
                        icon = <AlertTriangle className="text-amber-500 w-5 h-5 flex-shrink-0 group-hover:scale-110 transition-transform" />;
                      } else {
                        cardStyles = isFocused
                          ? "bg-blue-500/10 border-blue-500/60 shadow-lg shadow-blue-950/20 ring-1 ring-blue-500/30"
                          : "bg-zinc-900/40 border-white/5 hover:border-blue-500/30 hover:bg-blue-950/5";
                        accentColor = "bg-blue-500";
                        badgeText = "Water Flooding";
                        icon = <Droplets className="text-blue-500 w-5 h-5 flex-shrink-0 group-hover:scale-110 transition-transform" />;
                      }

                      return (
                        <div 
                          key={report.id} 
                          onClick={() => {
                            setFocusedReport(report);
                            setFocusedZone(null);
                          }}
                          className={`cursor-pointer border rounded-xl p-4 transition-all duration-300 shadow-md group relative overflow-hidden ${cardStyles}`}
                        >
                          {/* Status accent border */}
                          <div className={`absolute top-0 left-0 bottom-0 w-1 ${accentColor}`} />
                          
                          <div className="flex items-start gap-3 pl-1">
                            {icon}
                            <div className="space-y-1.5 min-w-0 flex-1">
                              <div className="flex items-center justify-between gap-2">
                                <span className="text-[10px] font-extrabold uppercase tracking-wider" style={{ color: report.type === 'mining' ? '#ef4444' : report.type === 'pollution' ? '#f59e0b' : '#3b82f6' }}>
                                  {badgeText}
                                </span>
                                <span className="text-[10px] text-zinc-500 font-medium">
                                  {formatTimeAgo(report.created_at)}
                                </span>
                              </div>
                              <p className="text-sm text-zinc-200 leading-snug break-words">
                                {report.description}
                              </p>
                              <div className="flex items-center justify-between gap-2 pt-1 border-t border-white/5">
                                <span className={`text-[9px] px-2 py-0.5 rounded-full font-bold border uppercase tracking-wider ${
                                  report.status === 'verified'
                                    ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                                    : report.status === 'dismissed'
                                    ? 'bg-zinc-500/10 text-zinc-400 border-zinc-500/20'
                                    : 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                                }`}>
                                  {report.status}
                                </span>
                                <span className="text-[9px] text-zinc-400 font-mono">
                                  {report.latitude.toFixed(4)}, {report.longitude.toFixed(4)}
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
          ) : (
            /* Flood Risk Assessment Tab Content */
            <div className="space-y-4">
              <div className="bg-zinc-900 border border-white/5 rounded-2xl p-4 shadow-xl">
                <h2 className="text-sm font-semibold text-zinc-200 flex items-center gap-2">
                  <Activity className="text-blue-500 animate-pulse" size={18} />
                  AI Risk Assessment
                </h2>
                <p className="text-xs text-zinc-400 mt-2 leading-relaxed">
                  Top-down predictive algorithms calculate community-level vulnerability index scores based on NDVI clearing data, elevation profiles, and precipitation.
                </p>

                {/* Sub-toggle Row */}
                <div className="grid grid-cols-3 gap-1 bg-zinc-950 p-1 border border-white/5 rounded-xl mt-3">
                  <button
                    onClick={() => setActiveRiskType('flood')}
                    className={`py-1 text-[10px] font-bold rounded-lg transition-all cursor-pointer text-center ${
                      activeRiskType === 'flood'
                        ? 'bg-blue-600 text-white shadow-sm'
                        : 'text-zinc-500 hover:text-zinc-300'
                    }`}
                  >
                    Flood Risk
                  </button>
                  <button
                    onClick={() => setActiveRiskType('mining')}
                    className={`py-1 text-[10px] font-bold rounded-lg transition-all cursor-pointer text-center ${
                      activeRiskType === 'mining'
                        ? 'bg-red-600 text-white shadow-sm'
                        : 'text-zinc-500 hover:text-zinc-300'
                    }`}
                  >
                    Mining Proximity
                  </button>
                  <button
                    onClick={() => setActiveRiskType('pollution')}
                    className={`py-1 text-[10px] font-bold rounded-lg transition-all cursor-pointer text-center ${
                      activeRiskType === 'pollution'
                        ? 'bg-amber-600 text-white shadow-sm'
                        : 'text-zinc-500 hover:text-zinc-300'
                    }`}
                  >
                    Pollution Index
                  </button>
                </div>
              </div>

              <div className="space-y-3">
                <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-400 flex items-center gap-2">
                  <Activity size={14} />
                  Monitored Communities ({floodRisks.length})
                </h3>
                
                {floodRisks.length === 0 ? (
                  <div className="text-center py-12 text-xs text-zinc-500 border border-dashed border-white/5 rounded-xl">
                    No community risk profiles found. Run the AI detection script to seed data.
                  </div>
                ) : (
                  <div className="space-y-3">
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

                      let cardStyles = "";
                      let badgeColor = "";
                      let riskText = "";
                      
                      if (status === 'high') {
                        cardStyles = isFocused 
                          ? "bg-red-500/10 border-red-500/60 shadow-lg shadow-red-950/20 ring-1 ring-red-500/30" 
                          : "bg-zinc-900/40 border-white/5 hover:border-red-500/30 hover:bg-red-950/5";
                        badgeColor = "text-red-400 border-red-500/20 bg-red-500/10";
                        riskText = "CRITICAL RISK";
                      } else if (status === 'medium') {
                        cardStyles = isFocused
                          ? "bg-amber-500/10 border-amber-500/60 shadow-lg shadow-amber-950/20 ring-1 ring-amber-500/30"
                          : "bg-zinc-900/40 border-white/5 hover:border-amber-500/30 hover:bg-amber-950/5";
                        badgeColor = "text-amber-400 border-amber-500/20 bg-amber-500/10";
                        riskText = "MODERATE RISK";
                      } else {
                        cardStyles = isFocused
                          ? "bg-blue-500/10 border-blue-500/60 shadow-lg shadow-blue-950/20 ring-1 ring-blue-500/30"
                          : "bg-zinc-900/40 border-white/5 hover:border-blue-500/30 hover:bg-blue-950/5";
                        badgeColor = "text-emerald-400 border-emerald-500/20 bg-emerald-500/10";
                        riskText = "LOW RISK";
                      }

                      let labelText = "Flood Factor";
                      if (activeRiskType === 'mining') labelText = "Proximity Index";
                      else if (activeRiskType === 'pollution') labelText = "Sediment Index";

                      return (
                        <div 
                          key={risk.id}
                          onClick={() => {
                            setFocusedZone(risk);
                            setFocusedReport(null);
                          }}
                          className={`cursor-pointer border rounded-xl p-4 transition-all duration-300 shadow-md group relative overflow-hidden ${cardStyles}`}
                        >
                          <div className={`absolute top-0 left-0 bottom-0 w-1 ${
                            status === 'high' ? 'bg-red-500' : status === 'medium' ? 'bg-amber-500' : 'bg-emerald-500'
                          }`} />
                          
                          <div className="flex items-start justify-between gap-2 pl-1">
                            <div className="space-y-1.5 min-w-0 flex-1">
                              <div className="flex items-center justify-between gap-2">
                                <span className="text-sm font-bold text-white group-hover:text-blue-400 transition-colors">
                                  {risk.community}
                                </span>
                                <span className={`text-[9px] px-2 py-0.5 rounded-full font-bold border uppercase tracking-wider ${badgeColor}`}>
                                  {riskText}
                                </span>
                              </div>
                              
                              <div className="flex items-center justify-between gap-4 pt-1.5 border-t border-white/5">
                                <div className="space-y-0.5">
                                  <span className="text-[9px] text-zinc-500 block uppercase font-medium">{labelText}</span>
                                  <span className={`text-base font-extrabold ${
                                    status === 'high' ? 'text-red-500' : status === 'medium' ? 'text-amber-500' : 'text-emerald-500'
                                  }`}>
                                    {(score * 100).toFixed(0)}%
                                  </span>
                                </div>
                                <div className="text-right">
                                  <span className="text-[9px] text-zinc-500 block uppercase font-medium">Location</span>
                                  <span className="text-[10px] text-zinc-400 font-mono">
                                    {risk.latitude.toFixed(3)}, {risk.longitude.toFixed(3)}
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
          )}
        </div>
      </aside>

      {/* Main Content - Map */}
      <main className="flex-1 relative p-4 bg-zinc-950">
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
          theme="dark"
        />
      </main>
    </div>
  );
}
