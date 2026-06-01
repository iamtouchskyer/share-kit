import React, { useEffect, useState, useRef } from 'react';
import { createShareCard } from '@suri/share-kit';

/**
 * ShareView — Public landing page component for shared achievements.
 * Fetches share data and renders a read-only share card with CTA.
 *
 * Props:
 * @param {string} shareCode - the share code from URL
 * @param {object} branding - { name, domain, tagline }
 * @param {string} ctaUrl - where "Join" button goes
 * @param {string} ctaText - CTA button text
 * @param {object} fetchConfig - { apiBase, fetchFn }
 */
export default function ShareView({
  shareCode,
  branding = { name: 'App', domain: 'example.com' },
  ctaUrl = '/',
  ctaText = 'Join Now',
  fetchConfig = {},
}) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(false);
  const containerRef = useRef(null);

  const { apiBase = '/api', fetchFn = fetch } = fetchConfig;

  useEffect(() => {
    (async () => {
      try {
        const res = await fetchFn(`${apiBase}/shares/${shareCode}`);
        if (!res.ok) throw new Error('Not found');
        setData(await res.json());
      } catch {
        setError(true);
      }
    })();
  }, [shareCode]);

  useEffect(() => {
    if (!data || !containerRef.current) return;
    const card = createShareCard(containerRef.current, {
      branding,
      content: {
        type: data.share_type,
        title: data.payload?.title || `${data.share_type} Achievement`,
        subtitle: data.user_name ? `by ${data.user_name}` : undefined,
        emoji: data.share_type === 'streak' ? '🔥' : data.share_type === 'result' ? '✅' : '🏆',
        stats: data.payload?.stats,
      },
      theme: 'ocean',
      readonly: true,
    });
    return () => card.destroy();
  }, [data]);

  if (error) {
    return (
      <div style={{ textAlign: 'center', padding: 48 }}>
        <h2>Share not found</h2>
        <a href={ctaUrl}>{ctaText}</a>
      </div>
    );
  }
  if (!data) {
    return <div style={{ textAlign: 'center', padding: 48, color: '#999' }}>Loading...</div>;
  }

  return (
    <div style={{ maxWidth: 480, margin: '0 auto', padding: 24, textAlign: 'center' }}>
      <div ref={containerRef} />
      <div style={{ marginTop: 24 }}>
        <a
          href={ctaUrl}
          style={{
            display: 'inline-block', padding: '12px 32px', borderRadius: 8,
            background: '#007aff', color: '#fff', textDecoration: 'none',
            fontWeight: 600, fontSize: 16,
          }}
        >
          {ctaText}
        </a>
      </div>
    </div>
  );
}
