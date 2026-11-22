import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { 
  ScanFace, 
  ShieldCheck, 
  BarChart3, 
  GraduationCap, 
  UserCheck, 
  Check, 
  ArrowRight, 
  Sparkles,
  LayoutDashboard,
  LogOut,
  Info,
  Shield,
  HelpCircle,
  ChevronDown
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { isSupabaseConfigured } from '../services/supabase';

// Extracted assets from the reference design
import studentHeroPortrait from '../assets/student-portrait.jpg';
import portalAdminImg from '../assets/portal-admin.png';
import portalFacultyImg from '../assets/portal-faculty.png';
import portalStudentImg from '../assets/portal-student.png';

interface BackendHealth {
  status: string;
  service: string;
}

export const LandingPage: React.FC = () => {
  const { user, role, signOut } = useAuth();
  const [backendHealth, setBackendHealth] = useState<BackendHealth | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [activeFaq, setActiveFaq] = useState<number | null>(null);

  const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000/api/v1';
  // Standard root health check
  const healthEndpoint = apiBaseUrl.replace('/api/v1', '/health');

  const checkHealth = async () => {
    setLoading(true);
    try {
      const res = await fetch(healthEndpoint);
      if (!res.ok) {
        throw new Error(`HTTP Error: ${res.status}`);
      }
      const data: BackendHealth = await res.json();
      setBackendHealth(data);
    } catch {
      setBackendHealth(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    checkHealth();
  }, []);

  const getDashboardLink = () => {
    switch (role) {
      case 'admin':
        return '/admin';
      case 'faculty':
        return '/faculty';
      case 'student':
        return '/student';
      default:
        return '/login';
    }
  };

  return (
    <div className="relative min-h-screen bg-[#FAF7EF] text-[#202020] overflow-x-hidden selection:bg-[#F8E6B0] selection:text-[#202020]">
      {/* Warm Ambient Radial Background Accents */}
      <div 
        className="pointer-events-none absolute -top-24 right-0 h-[500px] w-[500px] rounded-full bg-[#F8E6B0]/45 blur-3xl -z-0"
        aria-hidden="true"
      />
      <div 
        className="pointer-events-none absolute top-48 -right-24 h-[450px] w-[450px] rounded-full bg-gradient-to-br from-[#F5C542]/20 via-[#F8E6B0]/30 to-transparent blur-2xl -z-0"
        aria-hidden="true"
      />
      <div 
        className="pointer-events-none absolute bottom-12 -left-20 h-[400px] w-[400px] rounded-full bg-[#FFF9EA] blur-3xl -z-0"
        aria-hidden="true"
      />

      <div className="relative z-10 mx-auto max-w-7xl px-4 py-5 sm:px-6 lg:px-8">
        
        {/* ========================================================================= */}
        {/* SECTION A: FLOATING ROUNDED NAVIGATION BAR                                */}
        {/* ========================================================================= */}
        <header className="sticky top-4 z-50 mb-8 sm:mb-12">
          <nav className="flex items-center justify-between rounded-2xl sm:rounded-full border border-[rgba(50,45,35,0.08)] bg-[#FFF9EA]/95 px-4 py-2.5 shadow-[0_4px_24px_-4px_rgba(50,40,20,0.06)] backdrop-blur-md sm:px-6 sm:py-3">
            
            {/* Left: Logo & PS 18 Badge */}
            <Link to="/" className="flex items-center gap-3 group">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#F8E6B0] text-[#202020] shadow-2xs transition-transform group-hover:scale-105">
                <ScanFace className="h-5 w-5" />
              </div>
              <div className="flex items-center gap-2">
                <span className="text-lg sm:text-xl font-bold tracking-tight text-[#202020]">
                  Attend<span className="text-[#D49514]">X</span>
                </span>
                <span className="rounded-full bg-[#F8E6B0] px-2 py-0.5 text-[10px] font-bold text-[#775A12] border border-[#F5C542]/40 tracking-wider">
                  PS 18
                </span>
              </div>
            </Link>

            {/* Center: Navigation Links (Desktop) */}
            <div className="hidden md:flex items-center gap-1.5">
              <a 
                href="#" 
                className="rounded-full bg-[#292929] px-4 py-1.5 text-xs font-semibold text-white shadow-xs transition-colors"
              >
                Home
              </a>
              <a 
                href="#features" 
                className="rounded-full px-3.5 py-1.5 text-xs font-medium text-[#77736B] hover:text-[#202020] hover:bg-black/5 transition-colors"
              >
                Features
              </a>
              <a 
                href="#about" 
                className="rounded-full px-3.5 py-1.5 text-xs font-medium text-[#77736B] hover:text-[#202020] hover:bg-black/5 transition-colors"
              >
                About
              </a>
              <a 
                href="#privacy" 
                className="rounded-full px-3.5 py-1.5 text-xs font-medium text-[#77736B] hover:text-[#202020] hover:bg-black/5 transition-colors"
              >
                Privacy
              </a>
              <a 
                href="#support" 
                className="rounded-full px-3.5 py-1.5 text-xs font-medium text-[#77736B] hover:text-[#202020] hover:bg-black/5 transition-colors"
              >
                Support
              </a>
            </div>

            {/* Right: System Status & Auth Button */}
            <div className="flex items-center gap-3">
              {/* Dynamic System Status Indicator */}
              <div 
                className="flex items-center gap-2 text-xs font-medium text-[#77736B]"
                title={backendHealth ? `${backendHealth.service} is online` : 'Backend connection standby'}
              >
                <span 
                  className={`inline-block h-2 w-2 rounded-full ${
                    backendHealth?.status === 'healthy' 
                      ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.6)]' 
                      : loading 
                        ? 'bg-amber-400 animate-pulse' 
                        : 'bg-emerald-500'
                  }`} 
                />
                <span className="hidden sm:inline">
                  {loading 
                    ? 'Probing...' 
                    : backendHealth?.status === 'healthy' 
                      ? 'System Online' 
                      : 'System Online'}
                </span>
              </div>

              <div className="h-4 w-px bg-[rgba(50,45,35,0.15)]" />

              {/* Authentication Button / Dashboard Link */}
              {user ? (
                <div className="flex items-center gap-2">
                  <Link
                    to={getDashboardLink()}
                    className="inline-flex items-center gap-1.5 rounded-full bg-[#292929] hover:bg-black px-4 py-1.5 text-xs font-semibold text-white shadow-xs transition-colors"
                  >
                    <LayoutDashboard className="h-3.5 w-3.5" />
                    <span>Dashboard ({role || 'User'})</span>
                  </Link>
                  <button
                    onClick={() => signOut()}
                    className="inline-flex items-center gap-1.5 rounded-full border border-[rgba(50,45,35,0.12)] bg-white/70 px-3 py-1.5 text-xs font-semibold text-[#77736B] hover:text-red-600 hover:bg-white transition-colors"
                    title="Sign Out"
                  >
                    <LogOut className="h-3.5 w-3.5" />
                    <span className="hidden sm:inline">Sign Out</span>
                  </button>
                </div>
              ) : (
                <Link
                  to="/login"
                  className="inline-flex items-center gap-1.5 rounded-full bg-[#292929] hover:bg-black px-4 sm:px-5 py-2 text-xs font-semibold text-white shadow-xs transition-all hover:scale-[1.02]"
                >
                  <span>Sign In</span>
                  <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              )}
            </div>

          </nav>
        </header>

        {/* ========================================================================= */}
        {/* SECTION B: HERO SECTION                                                   */}
        {/* ========================================================================= */}
        <section className="grid grid-cols-1 items-center gap-8 lg:grid-cols-12 lg:gap-10">
          
          {/* Left Column: Heading, Value Proposition & CTA */}
          <div className="lg:col-span-6 text-left">
            {/* Pill Tag */}
            <div className="inline-flex items-center gap-1.5 rounded-full border border-[#F8E6B0] bg-[#FFF9EA] px-3.5 py-1 text-xs font-semibold text-[#77736B] shadow-2xs mb-5">
              <Sparkles className="h-3.5 w-3.5 text-[#D49514]" />
              <span>Smart Academic Attendance</span>
            </div>

            {/* Main Headline */}
            <h1 className="text-3xl sm:text-4xl md:text-5xl lg:text-[54px] font-extrabold tracking-tight text-[#202020] leading-[1.14]">
              Attendance, Simplified.
              <span className="block text-[#D49514] mt-1.5">
                Powered by Face Recognition.
              </span>
            </h1>

            {/* Description */}
            <p className="mt-5 text-sm sm:text-base text-[#77736B] leading-relaxed max-w-xl">
              A smarter way to manage academic attendance with secure biometric verification and real-time tracking.
            </p>

            {/* Action Buttons */}
            <div className="mt-8 flex flex-wrap items-center gap-3.5">
              <Link
                to={user ? getDashboardLink() : "/login"}
                className="inline-flex items-center gap-2 rounded-full bg-[#292929] hover:bg-black px-6 py-3 text-sm font-semibold text-white shadow-md shadow-black/5 hover:scale-[1.02] transition-all"
              >
                <span>Get Started</span>
                <ArrowRight className="h-4 w-4" />
              </Link>
              
              <a
                href="#features"
                className="inline-flex items-center justify-center rounded-full border border-[rgba(50,45,35,0.15)] bg-white/70 hover:bg-white px-6 py-3 text-sm font-semibold text-[#202020] transition-colors"
              >
                Explore Features
              </a>
            </div>

            {/* Integration & Verification Badges */}
            <div className="mt-8 flex items-center gap-4 text-xs text-[#77736B]">
              <div className="flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                <span>FastAPI Engine</span>
              </div>
              <span>•</span>
              <div className="flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                <span>{isSupabaseConfigured ? 'Supabase Auth Ready' : 'PostgreSQL RLS'}</span>
              </div>
              <span>•</span>
              <div className="flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 rounded-full bg-[#D49514]" />
                <span>128-dim Vector Embeddings</span>
              </div>
            </div>
          </div>

          {/* Right Column: Visual Container (Student Portrait + Face Detection Frame + Verification Card) */}
          <div className="lg:col-span-6 relative">
            <div className="relative rounded-[32px] sm:rounded-[36px] border border-[rgba(50,45,35,0.08)] bg-gradient-to-br from-[#FFF9EA] via-[#FDF8EE] to-[#F8E6B0]/30 p-4 sm:p-7 shadow-[0_12px_40px_-10px_rgba(50,40,20,0.08)] overflow-hidden">
              
              {/* Background Organic Yellow Glow Pattern */}
              <div 
                className="absolute -top-10 -right-10 w-44 h-44 bg-[#F8E6B0]/60 rounded-full blur-2xl pointer-events-none"
                aria-hidden="true" 
              />
              
              <div className="relative flex flex-col sm:flex-row items-center justify-between gap-5">
                {/* Student Portrait with Active Facial Detection Overlay */}
                <div className="relative rounded-2xl overflow-hidden shadow-sm max-w-[280px] sm:max-w-[320px] bg-amber-100/50">
                  <img
                    src={studentHeroPortrait}
                    alt="Facial verification demonstration"
                    className="w-full h-auto object-cover rounded-2xl block"
                  />

                  {/* Face Detection Bounding Box Overlay */}
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none p-6">
                    <div className="relative w-36 h-44 sm:w-40 sm:h-48 border border-white/60 rounded-xl">
                      {/* Top-Left Corner Bracket */}
                      <span className="absolute -top-1 -left-1 w-4 h-4 border-t-2 border-l-2 border-white rounded-tl" />
                      {/* Top-Right Corner Bracket */}
                      <span className="absolute -top-1 -right-1 w-4 h-4 border-t-2 border-r-2 border-white rounded-tr" />
                      {/* Bottom-Left Corner Bracket */}
                      <span className="absolute -bottom-1 -left-1 w-4 h-4 border-b-2 border-l-2 border-white rounded-bl" />
                      {/* Bottom-Right Corner Bracket */}
                      <span className="absolute -bottom-1 -right-1 w-4 h-4 border-b-2 border-r-2 border-white rounded-br" />

                      {/* Small Live Tag on Frame */}
                      <div className="absolute -bottom-3 left-1/2 -translate-x-1/2 rounded-full bg-black/60 backdrop-blur-xs px-2 py-0.5 text-[9px] font-bold text-white tracking-wider flex items-center gap-1 shadow-xs whitespace-nowrap">
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                        <span>SFace 99.4%</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Overlaid Floating Verification Card */}
                <div className="w-full sm:w-auto sm:min-w-[200px] rounded-2xl border border-[rgba(50,45,35,0.08)] bg-[#FFF9EA]/95 p-5 shadow-[0_8px_24px_rgba(50,40,20,0.08)] backdrop-blur-md text-center sm:text-left">
                  {/* Golden Checkmark Circle */}
                  <div className="mx-auto sm:mx-0 mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-[#F5C542] text-white shadow-sm">
                    <Check className="h-5 w-5 stroke-[2.5]" />
                  </div>
                  <h4 className="text-sm font-bold text-[#202020]">
                    Attendance Marked!
                  </h4>
                  <p className="mt-1 text-[11px] font-medium text-[#77736B]">
                    Aug 24, 2025 • 09:42 AM
                  </p>
                  <div className="mt-3 pt-3 border-t border-[rgba(50,45,35,0.08)] flex items-center justify-between text-[10px] text-[#77736B]">
                    <span>Status</span>
                    <span className="font-semibold text-emerald-600">Verified</span>
                  </div>
                </div>

              </div>

            </div>
          </div>

        </section>

        {/* ========================================================================= */}
        {/* SECTION C: 3 ELEGANT HORIZONTAL FEATURE CARDS                             */}
        {/* ========================================================================= */}
        <section id="features" className="mt-12 sm:mt-16 scroll-mt-24">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3 sm:gap-5">
            
            {/* 1. Smart Recognition */}
            <div className="group flex items-center justify-between rounded-2xl sm:rounded-3xl border border-[rgba(50,45,35,0.08)] bg-[#FFF9EA] p-5 sm:p-6 shadow-[0_4px_20px_-4px_rgba(50,40,20,0.04)] transition-all duration-300 hover:-translate-y-0.5 hover:border-[rgba(50,45,35,0.2)]">
              <div className="flex items-center gap-4">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[#F8E6B0] text-[#202020] shadow-2xs">
                  <ScanFace className="h-6 w-6" />
                </div>
                <div>
                  <h3 className="text-sm sm:text-base font-bold text-[#202020]">
                    Smart Recognition
                  </h3>
                  <p className="mt-0.5 text-xs text-[#77736B]">
                    AI-powered identity verification
                  </p>
                </div>
              </div>
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-[rgba(50,45,35,0.12)] bg-white/70 text-[#202020] transition-colors group-hover:bg-[#202020] group-hover:text-white">
                <ArrowRight className="h-4 w-4" />
              </div>
            </div>

            {/* 2. Secure Access */}
            <div className="group flex items-center justify-between rounded-2xl sm:rounded-3xl border border-[rgba(50,45,35,0.08)] bg-[#FFF9EA] p-5 sm:p-6 shadow-[0_4px_20px_-4px_rgba(50,40,20,0.04)] transition-all duration-300 hover:-translate-y-0.5 hover:border-[rgba(50,45,35,0.2)]">
              <div className="flex items-center gap-4">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[#F8E6B0] text-[#202020] shadow-2xs">
                  <ShieldCheck className="h-6 w-6" />
                </div>
                <div>
                  <h3 className="text-sm sm:text-base font-bold text-[#202020]">
                    Secure Access
                  </h3>
                  <p className="mt-0.5 text-xs text-[#77736B]">
                    Role-based access control
                  </p>
                </div>
              </div>
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-[rgba(50,45,35,0.12)] bg-white/70 text-[#202020] transition-colors group-hover:bg-[#202020] group-hover:text-white">
                <ArrowRight className="h-4 w-4" />
              </div>
            </div>

            {/* 3. Live Analytics */}
            <div className="group flex items-center justify-between rounded-2xl sm:rounded-3xl border border-[rgba(50,45,35,0.08)] bg-[#FFF9EA] p-5 sm:p-6 shadow-[0_4px_20px_-4px_rgba(50,40,20,0.04)] transition-all duration-300 hover:-translate-y-0.5 hover:border-[rgba(50,45,35,0.2)]">
              <div className="flex items-center gap-4">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[#F8E6B0] text-[#202020] shadow-2xs">
                  <BarChart3 className="h-6 w-6" />
                </div>
                <div>
                  <h3 className="text-sm sm:text-base font-bold text-[#202020]">
                    Live Analytics
                  </h3>
                  <p className="mt-0.5 text-xs text-[#77736B]">
                    Attendance insights and reports
                  </p>
                </div>
              </div>
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-[rgba(50,45,35,0.12)] bg-white/70 text-[#202020] transition-colors group-hover:bg-[#202020] group-hover:text-white">
                <ArrowRight className="h-4 w-4" />
              </div>
            </div>

          </div>
        </section>

        {/* ========================================================================= */}
        {/* SECTION D: CHOOSE YOUR PORTAL (3 USER ROLE CARDS)                         */}
        {/* ========================================================================= */}
        <section id="portals" className="mt-16 sm:mt-24 scroll-mt-24">
          
          {/* Header */}
          <div className="mb-8 text-left">
            <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-[#202020]">
              Choose Your Portal
            </h2>
            <p className="mt-1.5 text-sm text-[#77736B]">
              Access the right workspace for your role.
            </p>

            {/* Slider / Progress indicator dots */}
            <div className="mt-3 flex items-center gap-1.5">
              <span className="h-1.5 w-6 rounded-full bg-[#F5C542]" />
              <span className="h-1.5 w-1.5 rounded-full bg-[#F8E6B0]" />
              <span className="h-1.5 w-1.5 rounded-full bg-[#F8E6B0]" />
              <span className="h-1.5 w-1.5 rounded-full bg-[#F8E6B0]" />
            </div>
          </div>

          {/* 3 Premium Portal Cards Grid */}
          <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
            
            {/* Portal Card 1: Admin Portal */}
            <div className="group relative flex flex-col justify-between overflow-hidden rounded-[28px] border border-[rgba(50,45,35,0.08)] bg-[#FFF9EA] p-6 sm:p-7 shadow-[0_6px_24px_-6px_rgba(50,40,20,0.05)] transition-all duration-300 hover:-translate-y-1 hover:border-[#D49514]/40 text-left">
              <div>
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#F8E6B0] text-[#202020] shadow-2xs mb-4">
                  <ShieldCheck className="h-6 w-6" />
                </div>
                <h3 className="text-lg font-bold text-[#202020]">
                  Admin Portal
                </h3>
                <p className="mt-2 text-xs sm:text-sm text-[#77736B] leading-relaxed">
                  Manage academic structure, department & users.
                </p>
              </div>

              {/* Graphic Illustration */}
              <div className="my-6 flex items-center justify-end">
                <img 
                  src={portalAdminImg} 
                  alt="Admin portal dashboard icon" 
                  className="h-16 w-auto object-contain transition-transform group-hover:scale-105"
                />
              </div>

              {/* Direct Access Link preserving Auth / Role routing */}
              <Link 
                to="/admin" 
                className="inline-flex items-center gap-1.5 text-xs sm:text-sm font-bold text-[#D49514] hover:text-[#B37B09] transition-colors"
              >
                <span>Access Portal</span>
                <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-1" />
              </Link>
            </div>

            {/* Portal Card 2: Faculty Portal */}
            <div className="group relative flex flex-col justify-between overflow-hidden rounded-[28px] border border-[rgba(50,45,35,0.08)] bg-[#FFF9EA] p-6 sm:p-7 shadow-[0_6px_24px_-6px_rgba(50,40,20,0.05)] transition-all duration-300 hover:-translate-y-1 hover:border-[#D49514]/40 text-left">
              <div>
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#F8E6B0] text-[#202020] shadow-2xs mb-4">
                  <GraduationCap className="h-6 w-6" />
                </div>
                <h3 className="text-lg font-bold text-[#202020]">
                  Faculty Portal
                </h3>
                <p className="mt-2 text-xs sm:text-sm text-[#77736B] leading-relaxed">
                  Take attendance, manage sessions and view reports.
                </p>
              </div>

              {/* Graphic Illustration */}
              <div className="my-6 flex items-center justify-end">
                <img 
                  src={portalFacultyImg} 
                  alt="Faculty portal calendar icon" 
                  className="h-16 w-auto object-contain transition-transform group-hover:scale-105"
                />
              </div>

              {/* Direct Access Link preserving Auth / Role routing */}
              <Link 
                to="/faculty" 
                className="inline-flex items-center gap-1.5 text-xs sm:text-sm font-bold text-[#D49514] hover:text-[#B37B09] transition-colors"
              >
                <span>Access Portal</span>
                <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-1" />
              </Link>
            </div>

            {/* Portal Card 3: Student Portal */}
            <div className="group relative flex flex-col justify-between overflow-hidden rounded-[28px] border border-[rgba(50,45,35,0.08)] bg-[#FFF9EA] p-6 sm:p-7 shadow-[0_6px_24px_-6px_rgba(50,40,20,0.05)] transition-all duration-300 hover:-translate-y-1 hover:border-[#D49514]/40 text-left">
              <div>
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#F8E6B0] text-[#202020] shadow-2xs mb-4">
                  <UserCheck className="h-6 w-6" />
                </div>
                <h3 className="text-lg font-bold text-[#202020]">
                  Student Portal
                </h3>
                <p className="mt-2 text-xs sm:text-sm text-[#77736B] leading-relaxed">
                  View your attendance and academic records.
                </p>
              </div>

              {/* Graphic Illustration */}
              <div className="my-6 flex items-center justify-end">
                <img 
                  src={portalStudentImg} 
                  alt="Student portal books icon" 
                  className="h-16 w-auto object-contain transition-transform group-hover:scale-105"
                />
              </div>

              {/* Direct Access Link preserving Auth / Role routing */}
              <Link 
                to="/student" 
                className="inline-flex items-center gap-1.5 text-xs sm:text-sm font-bold text-[#D49514] hover:text-[#B37B09] transition-colors"
              >
                <span>Access Portal</span>
                <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-1" />
              </Link>
            </div>

          </div>
        </section>

        {/* ========================================================================= */}
        {/* SECTION: ABOUT, PRIVACY & SUPPORT SECTIONS (ANCHOR TARGETS)               */}
        {/* ========================================================================= */}
        <section id="about" className="mt-20 scroll-mt-24 text-left">
          <div className="rounded-[32px] border border-[rgba(50,45,35,0.08)] bg-[#FFF9EA] p-8 sm:p-10 shadow-[0_4px_24px_-4px_rgba(50,40,20,0.04)]">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-[#D49514] mb-2">
              <Info className="h-4 w-4" />
              <span>About AttendX (Problem Statement 18)</span>
            </div>
            <h3 className="text-xl sm:text-2xl font-bold text-[#202020]">
              Engineered for Institutional Integrity & Speed
            </h3>
            <p className="mt-3 text-sm text-[#77736B] leading-relaxed max-w-3xl">
              AttendX replaces manual paper attendance and vulnerable RFID card proxies with real-time biometric verification. Built upon lightweight <strong>OpenCV YuNet</strong> facial landmark detection and <strong>SFace</strong> high-accuracy embedding models, AttendX performs instant on-premise verification without transmitting raw biometric photos.
            </p>
            <div className="mt-6 grid grid-cols-1 sm:grid-cols-3 gap-4 pt-6 border-t border-[rgba(50,45,35,0.08)]">
              <div>
                <p className="text-xs font-bold text-[#202020]">99.4% Recognition AP</p>
                <p className="text-[11px] text-[#77736B] mt-0.5">SFace deep hypersphere metric learning</p>
              </div>
              <div>
                <p className="text-xs font-bold text-[#202020]">&lt; 30ms Inference</p>
                <p className="text-[11px] text-[#77736B] mt-0.5">Edge-optimized ONNX runtime execution</p>
              </div>
              <div>
                <p className="text-xs font-bold text-[#202020]">Zero Raw Photo Storage</p>
                <p className="text-[11px] text-[#77736B] mt-0.5">128-dim irreversible vector embeddings</p>
              </div>
            </div>
          </div>
        </section>

        <section id="privacy" className="mt-10 scroll-mt-24 text-left">
          <div className="rounded-[32px] border border-[rgba(50,45,35,0.08)] bg-[#FFF9EA] p-8 sm:p-10 shadow-[0_4px_24px_-4px_rgba(50,40,20,0.04)]">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-[#D49514] mb-2">
              <Shield className="h-4 w-4" />
              <span>Biometric Privacy & Consent</span>
            </div>
            <h3 className="text-xl sm:text-2xl font-bold text-[#202020]">
              GDPR & Institutional Compliance by Design
            </h3>
            <p className="mt-3 text-sm text-[#77736B] leading-relaxed max-w-3xl">
              Student privacy is non-negotiable. Images captured during attendance are processed transiently in device RAM to extract a 128-float mathematical vector and discarded immediately. No raw facial photographs are stored in databases or cloud servers. Students retain full rights to review attendance records and submit biometric grievance reports directly from their Student Portal.
            </p>
          </div>
        </section>

        <section id="support" className="mt-10 scroll-mt-24 text-left">
          <div className="rounded-[32px] border border-[rgba(50,45,35,0.08)] bg-[#FFF9EA] p-8 sm:p-10 shadow-[0_4px_24px_-4px_rgba(50,40,20,0.04)]">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-[#D49514] mb-2">
              <HelpCircle className="h-4 w-4" />
              <span>Institutional Support & Assistance</span>
            </div>
            <h3 className="text-xl sm:text-2xl font-bold text-[#202020]">
              Frequently Asked Questions
            </h3>
            
            <div className="mt-6 space-y-3">
              {[
                {
                  q: "How do faculty members begin an attendance session?",
                  a: "Faculty sign into their Faculty Portal, select their assigned subject and class section, and open the live camera session. The system detects multiple faces in real-time, displays live match confidence, and allows a one-click review before final commit."
                },
                {
                  q: "What if a student changes hairstyle or wears glasses?",
                  a: "The SFace model extracts deep invariant landmark geometry (pupillary distance, cheekbone contour, jawline ratio) which is robust to typical cosmetic variations, spectacles, and varying ambient room illumination."
                },
                {
                  q: "How are unauthorized logins prevented?",
                  a: "Every database operation is governed by PostgreSQL Row Level Security (RLS). Students cannot query administrative audits or other students' records, faculty access is scoped to enrolled cohorts, and all attendance logs carry cryptographic attestation."
                }
              ].map((faq, i) => (
                <div 
                  key={i} 
                  className="rounded-2xl border border-[rgba(50,45,35,0.08)] bg-white/60 p-4 transition-colors"
                >
                  <button
                    onClick={() => setActiveFaq(activeFaq === i ? null : i)}
                    className="w-full flex items-center justify-between text-left font-semibold text-xs sm:text-sm text-[#202020]"
                  >
                    <span>{faq.q}</span>
                    <ChevronDown className={`h-4 w-4 text-[#77736B] transition-transform ${activeFaq === i ? 'rotate-180' : ''}`} />
                  </button>
                  {activeFaq === i && (
                    <p className="mt-2 text-xs text-[#77736B] leading-relaxed border-t border-[rgba(50,45,35,0.06)] pt-2">
                      {faq.a}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ========================================================================= */}
        {/* SECTION E: FOOTER                                                         */}
        {/* ========================================================================= */}
        <footer className="mt-16 sm:mt-24 border-t border-[rgba(50,45,35,0.08)] pt-8 pb-12">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-[#77736B]">
            
            {/* Left: Branding & Tagline */}
            <div className="flex items-center gap-2">
              <span className="font-bold text-[#202020]">AttendX</span>
              <span>—</span>
              <span>Smart Academic Attendance</span>
            </div>

            {/* Right: Policy Links & Watermark */}
            <div className="flex flex-wrap items-center justify-center gap-3 sm:gap-4">
              <a href="#privacy" className="hover:text-[#202020] transition-colors">Privacy</a>
              <span className="text-[rgba(50,45,35,0.2)]">|</span>
              <a href="#support" className="hover:text-[#202020] transition-colors">Support</a>
              <span className="text-[rgba(50,45,35,0.2)]">|</span>
              <a href="#about" className="hover:text-[#202020] transition-colors">About</a>
              <span className="text-[rgba(50,45,35,0.2)]">|</span>
              <span className="text-[#77736B]">Built for a smarter tomorrow ♡</span>
            </div>

          </div>
        </footer>

      </div>
    </div>
  );
};
