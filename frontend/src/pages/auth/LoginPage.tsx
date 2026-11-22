import React, { useState } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { 
  ScanFace, 
  Lock, 
  Mail, 
  Eye, 
  EyeOff, 
  AlertCircle, 
  Loader2, 
  ShieldAlert,
  ArrowLeft,
  ArrowRight,
  ShieldCheck,
  Sparkles
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { isSupabaseConfigured } from '../../services/supabase';

export const LoginPage: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { signIn, authError, clearErrors } = useAuth();

  const [email, setEmail] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [showPassword, setShowPassword] = useState<boolean>(false);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Intended destination after login (if redirected by ProtectedRoute)
  const fromLocation = (location.state as { from?: { pathname: string } })?.from?.pathname;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    clearErrors();

    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      setFormError('Please enter your institutional email address.');
      return;
    }

    if (!password) {
      setFormError('Please enter your password.');
      return;
    }

    setIsSubmitting(true);

    try {
      const { error } = await signIn(trimmedEmail, password);
      if (error) {
        setFormError(error.message);
        return;
      }

      // If user had a prior destination, navigate there; otherwise role redirect in PublicOnlyRoute kicks in
      if (fromLocation) {
        navigate(fromLocation, { replace: true });
      }
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'An unexpected login failure occurred.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="relative isolate flex min-h-screen flex-col justify-between overflow-x-hidden bg-[#F8F5ED] text-[#292929] selection:bg-[#F8E6B0] selection:text-[#292929]">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -right-40 -top-48 -z-10 h-[560px] w-[560px] rounded-full bg-[#F8E6B0]/45 blur-3xl"
      />
      
      {/* ========================================================================= */}
      {/* SECTION A: TOP HEADER                                                     */}
      {/* ========================================================================= */}
      <header className="w-full max-w-7xl mx-auto px-4 sm:px-8 lg:px-12 pt-6 sm:pt-8 pb-4 flex items-center justify-between gap-3">
        {/* Left: Branding */}
        <Link to="/" className="group flex min-w-0 items-center gap-2 rounded-full border border-[#E9E0D0] bg-[#FFFDFA]/80 px-2.5 py-1.5 shadow-sm transition-colors hover:bg-[#FFFDFA] sm:gap-3 sm:px-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#F8E6B0] text-[#292929] shadow-2xs transition-transform group-hover:scale-105 sm:h-10 sm:w-10">
            <ScanFace className="h-5 w-5" />
          </div>
          <div className="flex min-w-0 items-center gap-1.5 sm:gap-2">
            <span className="text-lg font-bold tracking-tight text-[#292929] sm:text-xl">
              Attend<span className="text-[#C18B24]">X</span>
            </span>
            <span className="shrink-0 rounded-full border border-[#F5C542]/40 bg-[#F8E6B0] px-1.5 py-0.5 text-[9px] font-bold tracking-wider text-[#775A12] sm:px-2 sm:text-[10px]">
              PS 18
            </span>
          </div>
        </Link>

        {/* Right: Back to Home Link */}
        <Link 
          to="/" 
          className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-[#E9E0D0] bg-[#FFFDFA]/75 px-3 py-2 text-[11px] font-semibold text-[#79756D] transition-colors hover:bg-[#FFFDFA] hover:text-[#292929] sm:gap-2 sm:px-4 sm:text-sm"
        >
          <ArrowLeft className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
          <span>Back to Home</span>
        </Link>
      </header>

      {/* ========================================================================= */}
      {/* MAIN TWO-COLUMN SECTION                                                   */}
      {/* ========================================================================= */}
      <main className="flex w-full max-w-7xl flex-1 items-center px-4 py-8 sm:px-8 sm:py-12 lg:px-12">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-16 items-center w-full">
          
          {/* ========================================================================= */}
          {/* SECTION B: LEFT SECTION (WELCOME & BRANDING)                              */}
          {/* ========================================================================= */}
          <div className="min-w-0 text-left lg:col-span-6 xl:col-span-7">
            {/* Small Label */}
            <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-[#E9E0D0] bg-[#FFFDFA]/75 px-3.5 py-2 text-[10px] font-bold tracking-[0.16em] text-[#C18B24] uppercase shadow-sm">
              <Sparkles className="h-3.5 w-3.5" />
              SMART ACADEMIC ATTENDANCE
            </div>

            {/* Main & Highlighted Headings */}
            <h1 className="text-4xl font-semibold leading-[1.1] tracking-tight text-[#292929] sm:text-5xl lg:text-[52px]">
              Welcome Back.
              <span className="mt-2 block text-[#C18B24]">
                Your campus, connected.
              </span>
            </h1>

            {/* Supporting Description */}
            <p className="mt-5 text-sm sm:text-base text-[#79756D] leading-relaxed max-w-lg">
              Sign in to access your personalized academic workspace.
            </p>

            {/* Feature Highlights */}
            <div className="mt-8 space-y-4 pt-6 border-t border-[#E9E0D0]/80 max-w-md">
              <div className="flex items-center gap-3 text-sm text-[#292929]">
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[#F8E6B0]/70 text-[#C18B24]">
                  <ShieldCheck className="h-4 w-4" />
                </div>
                <span className="font-medium">Secure institutional access.</span>
              </div>

              <div className="flex items-center gap-3 text-sm text-[#292929]">
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[#F8E6B0]/70 text-[#C18B24]">
                  <ScanFace className="h-4 w-4" />
                </div>
                <span className="font-medium">AI-powered attendance.</span>
              </div>
            </div>
          </div>

          {/* ========================================================================= */}
          {/* SECTION C: RIGHT SECTION (LOGIN CARD)                                     */}
          {/* ========================================================================= */}
          <div className="w-full min-w-0 lg:col-span-6 xl:col-span-5">
            <div className="rounded-[30px] border border-[#E9E0D0] bg-[#FFFDFA]/95 p-6 text-left shadow-[0_18px_48px_-24px_rgba(50,45,35,0.18)] sm:p-8 lg:p-10">
              
              {/* Card Header */}
              <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-[#292929]">
                Sign In
              </h2>
              <p className="mt-1.5 text-xs sm:text-sm text-[#79756D]">
                Enter your institutional credentials.
              </p>

              {/* Missing Supabase Configuration Notice */}
              {!isSupabaseConfigured && (
                <div className="mt-6 rounded-xl border border-[#F8E6B0] bg-[#FFF9EA] p-4 text-left">
                  <div className="flex gap-3">
                    <ShieldAlert className="h-5 w-5 text-[#C18B24] shrink-0 mt-0.5" />
                    <div className="text-xs text-[#775A12]">
                      <p className="font-semibold">Supabase Environment Keys Missing</p>
                      <p className="mt-1">
                        Please provide <code className="font-mono bg-[#F8E6B0]/50 px-1 py-0.5 rounded">VITE_SUPABASE_URL</code> and <code className="font-mono bg-[#F8E6B0]/50 px-1 py-0.5 rounded">VITE_SUPABASE_ANON_KEY</code> in environment variables to connect to live authentication.
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Form Error Banner */}
              {(formError || authError) && (
                <div className="mt-6 rounded-xl border border-red-200 bg-red-50 p-4 text-left" role="alert">
                  <div className="flex items-start gap-3">
                    <AlertCircle className="h-5 w-5 text-red-600 shrink-0 mt-0.5" />
                    <div className="text-xs text-red-800">
                      <p className="font-semibold">Authentication Failed</p>
                      <p className="mt-0.5 text-red-700">{formError || authError}</p>
                    </div>
                  </div>
                </div>
              )}

              {/* Login Form */}
              <form className="mt-6 space-y-5" onSubmit={handleSubmit}>
                {/* Institutional Email Field */}
                <div>
                  <label 
                    htmlFor="email" 
                    className="block text-[11px] font-bold tracking-wider text-[#292929] uppercase mb-1.5"
                  >
                    INSTITUTIONAL EMAIL
                  </label>
                  <div className="relative">
                    <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5 text-[#79756D]">
                      <Mail className="h-4 w-4" />
                    </div>
                    <input
                      id="email"
                      name="email"
                      type="email"
                      autoComplete="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="Your email address"
                      className="block w-full rounded-xl border border-[#E9E0D0] bg-[#F6F2E9] py-3 pl-10 pr-3.5 text-sm text-[#292929] placeholder-[#79756D]/60 focus:border-[#C18B24] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#C18B24]/20 transition-colors"
                    />
                  </div>
                </div>

                {/* Password Field */}
                <div>
                  <label 
                    htmlFor="password" 
                    className="block text-[11px] font-bold tracking-wider text-[#292929] uppercase mb-1.5"
                  >
                    PASSWORD
                  </label>
                  <div className="relative">
                    <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5 text-[#79756D]">
                      <Lock className="h-4 w-4" />
                    </div>
                    <input
                      id="password"
                      name="password"
                      type={showPassword ? 'text' : 'password'}
                      autoComplete="current-password"
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Your password"
                      className="block w-full rounded-xl border border-[#E9E0D0] bg-[#F6F2E9] py-3 pl-10 pr-11 text-sm text-[#292929] placeholder-[#79756D]/60 focus:border-[#C18B24] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#C18B24]/20 transition-colors"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute inset-y-0 right-0 flex items-center pr-3.5 text-[#79756D] hover:text-[#292929] focus:outline-none transition-colors"
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                    >
                      {showPassword ? (
                        <EyeOff className="h-4 w-4" />
                      ) : (
                        <Eye className="h-4 w-4" />
                      )}
                    </button>
                  </div>
                </div>

                {/* Submit Button */}
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl bg-[#292929] py-3.5 px-4 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-black focus:outline-none focus:ring-2 focus:ring-[#C18B24] focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span>Verifying Credentials...</span>
                    </>
                  ) : (
                    <>
                      <span>Sign In to AttendX</span>
                      <ArrowRight className="h-4 w-4" />
                    </>
                  )}
                </button>
              </form>

              {/* Bottom Card Footer */}
              <div className="mt-6 pt-5 border-t border-[#E9E0D0]/60 text-center">
                <p className="text-xs text-[#79756D]">
                  Authorized institutional accounts only.
                </p>
              </div>

            </div>
          </div>

        </div>
      </main>

      {/* ========================================================================= */}
      {/* SECTION D: FOOTER                                                         */}
      {/* ========================================================================= */}
      <footer className="w-full border-t border-[#E9E0D0] py-6">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-3 px-4 text-xs text-[#79756D] sm:flex-row sm:px-8 lg:px-12">
          <div>
            <span>AttendX · Smart Academic Attendance</span>
          </div>
          <div className="flex items-center gap-3">
            <Link to="/#privacy" className="hover:text-[#292929] transition-colors">Privacy</Link>
            <span>·</span>
            <Link to="/#support" className="hover:text-[#292929] transition-colors">Support</Link>
          </div>
        </div>
      </footer>

    </div>
  );
};
