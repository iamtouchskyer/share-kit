import React, { useRef, useEffect, useState } from 'react';
import { createShareCard } from '@suri/share-kit';

/**
 * ShareButton — React wrapper for share card with modal.
 *
 * Props:
 * @param {object} branding - { name, domain, tagline?, logo? }
 * @param {object} content - { type, title, subtitle?, emoji?, stats? }
 * @param {string} theme - initial theme name
 * @param {object} shareConfig - { apiBase, fetchFn, buildShareUrl } for useShare hook
 * @param {function} onShareCreated - (code, url) => void
 * @param {React.ReactNode} trigger - custom trigger element (default: button)
 * @param {object} modalProps - extra props for modal container
 */
export default function ShareButton({
  branding = { name: 'App', domain: 'example.com' },
  content = {},
  theme = 'ocean',
  shareConfig = {},
  onShareCreated,
  trigger,
  children,
  className,
  style,
}) {
  const [open, setOpen] = useState(false);
  const [shareUrl, setShareUrl] = useState(null);
  const containerRef = useRef(null);
  const cardRef = useRef(null);

  const {
    apiBase = '/api',
    fetchFn = (url, opts) => fetch(url, opts),
    buildShareUrl = (code) => `${window.location.origin}/s/${code}`,
  } = shareConfig;

  const handleOpen = async () => {
    // Create share first
    try {
      const res = await fetchFn(`${apiBase}/shares`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ share_type: content.type || 'general', payload: content }),
      });
      const data = await res.json();
      const url = buildShareUrl(data.share_code);
      setShareUrl(url);
      if (onShareCreated) onShareCreated(data.share_code, url);
    } catch (e) {
      // Proceed anyway — user can still export image
    }
    setOpen(true);
  };

  useEffect(() => {
    if (!open || !containerRef.current) return;
    cardRef.current = createShareCard(containerRef.current, {
      branding,
      content,
      theme,
      actions: {
        onCopyLink: () => {
          if (shareUrl) navigator.clipboard.writeText(shareUrl);
        },
        onTwitter: () => {
          if (!shareUrl) return;
          const text = content.title || `Check this out on ${branding.name}!`;
          window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(shareUrl)}`, '_blank');
        },
        onExport: null, // use default download behavior
      },
    });
    return () => { cardRef.current?.destroy(); };
  }, [open]);

  return (
    <>
      {trigger ? (
        <span onClick={handleOpen}>{trigger}</span>
      ) : (
        <button onClick={handleOpen} className={className} style={style}>
          {children || '↗ Share'}
        </button>
      )}
      {open && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 10000,
          background: 'rgba(0,0,0,0.5)', display: 'flex',
          alignItems: 'center', justifyContent: 'center',
        }} onClick={(e) => { if (e.target === e.currentTarget) setOpen(false); }}>
          <div style={{
            background: '#fff', borderRadius: 16, padding: 24,
            maxWidth: 480, width: '90%', maxHeight: '90vh', overflow: 'auto',
          }}>
            <div ref={containerRef} />
            <button
              onClick={() => setOpen(false)}
              style={{ marginTop: 12, width: '100%', padding: '8px', border: '1px solid #ddd', borderRadius: 8, cursor: 'pointer', background: 'transparent' }}
            >
              Close
            </button>
          </div>
        </div>
      )}
    </>
  );
}
