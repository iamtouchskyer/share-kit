import { useState, useCallback } from 'react';

/**
 * useShare — hook for managing share flow.
 * @param {object} config
 * @param {string} config.apiBase - e.g. '/api' or 'https://api.example.com'
 * @param {function} config.fetchFn - fetch-compatible function (for auth headers)
 * @param {function} config.buildShareUrl - (shareCode) => full URL
 */
export function useShare(config = {}) {
  const {
    apiBase = '/api',
    fetchFn = fetch,
    buildShareUrl = (code) => `${window.location.origin}/s/${code}`,
  } = config;

  const [shareCode, setShareCode] = useState(null);
  const [shareUrl, setShareUrl] = useState(null);
  const [loading, setLoading] = useState(false);

  const createShare = useCallback(async (shareType, payload) => {
    setLoading(true);
    try {
      const res = await fetchFn(`${apiBase}/shares`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ share_type: shareType, payload }),
      });
      const data = await res.json();
      const code = data.share_code;
      const url = buildShareUrl(code);
      setShareCode(code);
      setShareUrl(url);
      return { code, url };
    } finally {
      setLoading(false);
    }
  }, [apiBase, fetchFn, buildShareUrl]);

  const copyLink = useCallback(() => {
    if (shareUrl) navigator.clipboard.writeText(shareUrl);
  }, [shareUrl]);

  const tweetShare = useCallback((text) => {
    if (!shareUrl) return;
    const twitterUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(shareUrl)}`;
    window.open(twitterUrl, '_blank');
  }, [shareUrl]);

  return { shareCode, shareUrl, loading, createShare, copyLink, tweetShare };
}
