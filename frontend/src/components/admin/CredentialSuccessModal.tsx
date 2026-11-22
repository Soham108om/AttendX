import React, { useState } from 'react';
import { CheckCircle2, Copy, Check, ShieldCheck, X } from 'lucide-react';
import type { ProvisionedCredentialData } from '../../types';

interface CredentialSuccessModalProps {
  isOpen: boolean;
  onClose: () => void;
  data: ProvisionedCredentialData | null;
}

export const CredentialSuccessModal: React.FC<CredentialSuccessModalProps> = ({
  isOpen,
  onClose,
  data,
}) => {
  const [copied, setCopied] = useState<boolean>(false);

  if (!isOpen || !data) return null;

  const handleCopy = () => {
    const credText = `AttendX Portal Credentials\nName: ${data.fullName}\nEmail: ${data.email}\nRole: ${data.role.toUpperCase()}\nInitial Password: ${data.initialPassword}`;
    navigator.clipboard.writeText(credText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs">
      <div className="w-full max-w-md rounded-2xl border border-emerald-200 bg-white p-6 shadow-xl animate-in fade-in zoom-in-95 duration-150">
        <div className="flex items-start justify-between border-b border-slate-100 pb-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700">
              <CheckCircle2 className="h-6 w-6" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">
                {data.role === 'faculty' ? 'Faculty Account Created' : 'Student Account Created'}
              </h3>
              <p className="text-xs text-slate-500">Initial Access Credentials Provisioned</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="mt-5 space-y-3.5 text-xs">
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-2">
            <div className="flex justify-between">
              <span className="text-slate-500">Full Name:</span>
              <span className="font-semibold text-slate-900">{data.fullName}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Email Address:</span>
              <span className="font-semibold text-slate-900 font-mono">{data.email}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">ID / Roll Code:</span>
              <span className="font-semibold text-purple-700 font-mono">{data.idCode}</span>
            </div>
            <div className="pt-2 border-t border-slate-200 flex items-center justify-between">
              <span className="font-bold text-slate-700">Initial Password:</span>
              <span className="font-mono font-extrabold text-sm text-blue-700 bg-white px-2 py-0.5 rounded border border-blue-200">
                {data.initialPassword}
              </span>
            </div>
          </div>

          <div className="rounded-xl border border-blue-100 bg-blue-50 p-3 text-[11px] text-blue-800 leading-relaxed">
            <div className="flex items-start gap-2">
              <ShieldCheck className="h-4 w-4 text-blue-600 shrink-0 mt-0.5" />
              <span>
                Provide this credential securely to the user. For security, this temporary password
                will not be shown again once this dialog is dismissed.
              </span>
            </div>
          </div>
        </div>

        <div className="mt-6 flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
          <button
            onClick={handleCopy}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
          >
            {copied ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
            <span>{copied ? 'Copied to Clipboard' : 'Copy Credentials'}</span>
          </button>
          <button
            onClick={onClose}
            className="rounded-xl bg-purple-600 px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-purple-700 transition-colors"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
