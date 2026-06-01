import React, { useRef, useEffect, useState } from 'react';
import { createReferralCard } from '@suri/share-kit';
import { copyToClipboard } from '@suri/share-kit/utils';

/**
 * ReferralCard — React wrapper for referral invitation card.
 *
 * Props:
 * @param {object} branding - { name, domain }
 * @param {object} reward - { amount, unit, description }
 * @param {string} theme - theme name
 * @param {object} fetchConfig - { apiBase, fetchFn }
 * @param {function} onCopy - (code, url) => void
 */
export default function ReferralCard({
  branding = { name: 'App', domain: 'example.com' },
  reward = { amount: 7, unit: 'days', description: 'Pro access' },
  theme = 'light',
  fetchConfig = {},
  onCopy,
}) {
  const containerRef = useRef(null);
  const cardRef = useRef(null);
  const [loading, setLoading] = useState(true);

  const { apiBase = '/api', fetchFn = fetch } = fetchConfig;

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const res = await fetchFn(`${apiBase}/referral/code`);
        const data = await res.json();
        if (!mounted) return;

        const statsRes = await fetchFn(`${apiBase}/referral/stats`);
        const statsData = await statsRes.json();
        if (!mounted) return;

        cardRef.current = createReferralCard(containerRef.current, {
          code: data.referral_code,
          stats: { totalReferred: statsData.referral_count || 0 },
          reward,
          branding,
          theme,
          onCopy: onCopy || ((code, url) => {
            copyToClipboard(url);
          }),
        });
      } catch (e) {
        // Silent fail
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; cardRef.current?.destroy(); };
  }, [apiBase, fetchFn, branding, reward, theme, onCopy]);

  if (loading) return <div style={{ padding: 24, textAlign: 'center', color: '#999' }}>Loading...</div>;
  return <div ref={containerRef} />;
}
