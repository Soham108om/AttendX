import React from 'react';
import { AlertCircle, RefreshCw } from 'lucide-react';

interface ErrorDisplayProps {
  title?: string;
  message: string;
  onRetry?: () => void;
  className?: string;
}

export const ErrorDisplay: React.FC<ErrorDisplayProps> = ({
  title = 'Application Error',
  message,
  onRetry,
  className = '',
}) => {
  return (
    <div
      className={`rounded-xl border border-red-200 bg-red-50 p-6 shadow-sm transition-all ${className}`}
      role="alert"
    >
      <div className="flex items-start gap-4">
        <div className="rounded-lg bg-red-100 p-2 text-red-600">
          <AlertCircle className="h-6 w-6" />
        </div>
        <div className="flex-1">
          <h3 className="text-base font-semibold text-red-900">{title}</h3>
          <p className="mt-1 text-sm text-red-700">{message}</p>
          {onRetry && (
            <button
              onClick={onRetry}
              className="mt-4 inline-flex items-center gap-2 rounded-lg bg-red-600 px-3.5 py-1.5 text-xs font-medium text-white shadow-sm hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Retry
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
