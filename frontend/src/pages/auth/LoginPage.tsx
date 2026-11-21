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
  ArrowLeft 
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
    <div className="flex min-h-[calc(100vh-80px)] flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <Link 
          to="/" 
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-blue-600 transition-colors mb-6"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          <span>Back to Landing Page</span>
        </Link>

        <div className="flex items-center justify-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-600 text-white shadow-lg shadow-blue-500/20">
            <ScanFace className="h-7 w-7" />
          </div>
          <div>
            <h2 className="text-2xl font-extrabold tracking-tight text-slate-900">
              Attend<span className="text-blue-600">X</span>
            </h2>
            <p className="text-xs text-slate-500">Academic Single Sign-On</p>
          </div>
        </div>

        <h3 className="mt-6 text-center text-xl font-bold tracking-tight text-slate-900">
          Sign in to your portal
        </h3>
        <p className="mt-1 text-center text-xs text-slate-500">
          Authorized access for Administrators, Faculty, and Enrolled Students
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm sm:px-10">
          {/* Missing Supabase Configuration Warning */}
          {!isSupabaseConfigured && (
            <div className="mb-6 rounded-xl border border-amber-200 bg-amber-50 p-4 text-left">
              <div className="flex gap-3">
                <ShieldAlert className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
                <div className="text-xs text-amber-800">
                  <p className="font-semibold">Supabase Environment Keys Missing</p>
                  <p className="mt-1 text-amber-700">
                    Please provide <code className="font-mono bg-amber-100 px-1 py-0.5 rounded">VITE_SUPABASE_URL</code> and <code className="font-mono bg-amber-100 px-1 py-0.5 rounded">VITE_SUPABASE_ANON_KEY</code> in <code className="font-mono bg-amber-100 px-1 py-0.5 rounded">frontend/.env</code> to connect to live authentication.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Form Error Banner */}
          {(formError || authError) && (
            <div className="mb-6 rounded-xl border border-red-200 bg-red-50 p-4 text-left" role="alert">
              <div className="flex items-start gap-3">
                <AlertCircle className="h-5 w-5 text-red-600 shrink-0 mt-0.5" />
                <div className="text-xs text-red-800">
                  <p className="font-semibold">Authentication Failed</p>
                  <p className="mt-0.5 text-red-700">{formError || authError}</p>
                </div>
              </div>
            </div>
          )}

          <form className="space-y-5" onSubmit={handleSubmit}>
            <div>
              <label 
                htmlFor="email" 
                className="block text-xs font-semibold uppercase tracking-wider text-slate-700"
              >
                Institutional Email
              </label>
              <div className="relative mt-1.5 rounded-lg shadow-sm">
                <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-slate-400">
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
                  placeholder="name@university.edu"
                  className="block w-full rounded-xl border border-slate-300 bg-white py-2.5 pl-10 pr-3 text-sm text-slate-900 placeholder-slate-400 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/20"
                />
              </div>
            </div>

            <div>
              <label 
                htmlFor="password" 
                className="block text-xs font-semibold uppercase tracking-wider text-slate-700"
              >
                Password
              </label>
              <div className="relative mt-1.5 rounded-lg shadow-sm">
                <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-slate-400">
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
                  placeholder="••••••••••••"
                  className="block w-full rounded-xl border border-slate-300 bg-white py-2.5 pl-10 pr-10 text-sm text-slate-900 placeholder-slate-400 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/20"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute inset-y-0 right-0 flex items-center pr-3 text-slate-400 hover:text-slate-600 focus:outline-none"
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

            <button
              type="submit"
              disabled={isSubmitting}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 py-2.5 px-4 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60 transition-colors"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Verifying Credentials...</span>
                </>
              ) : (
                <span>Sign In to AttendX</span>
              )}
            </button>
          </form>

          <div className="mt-6 border-t border-slate-100 pt-4 text-center">
            <p className="text-xs text-slate-400 leading-relaxed">
              Institutional accounts and role assignments are administered by the Academic Registrar.
              Public registration is prohibited.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
