'use client';

import { useState } from 'react';

export function LoginButton({
  campaignKey,
  label,
  className = 'btn-primary',
}: {
  campaignKey?: string;
  label: string;
  className?: string;
}) {
  const [loading, setLoading] = useState(false);

  async function handleLogin() {
    setLoading(true);
    try {
      // Carry the campaign through so its UTM values reach Deriv.
      const qs = campaignKey ? `?c=${encodeURIComponent(campaignKey)}` : '';
      const res = await fetch(`/api/auth/url${qs}`);
      const { url } = await res.json();
      window.location.href = url;
    } catch {
      setLoading(false);
    }
  }

  return (
    <button className={className} onClick={handleLogin} disabled={loading}>
      {loading ? 'Redirecting…' : label}
    </button>
  );
}
