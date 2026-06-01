import { useState, useCallback } from 'react';
import { copyToClipboard } from '@suri/share-kit/utils';

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
  const [error, setError] = useState(null);

  const createShare = useCallback(async (shareType, payload) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchFn(`${apiBase}/shares`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ share_type: shareType, payload }),
      });
      if (!res.ok) throw new Error(`Share failed: ${res.status}`);
      const data = await res.json();
      const code = data.share_code;
      const url = buildShareUrl(code);
      setShareCode(code);
      setShareUrl(url);
      return { code, url };
    } catch (e) {
      setError(e);
      return null;
    } finally {
      setLoading(false);
    }
  }, [apiBase, fetchFn, buildShareUrl]);

  const copyLink = useCallback(() => {
    if (shareUrl) copyToClipboard(shareUrl);
  }, [shareUrl]);

  const tweetShare = useCallback((text) => {
    if (!shareUrl) return;
    const twitterUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(shareUrl)}`;
    window.open(twitterUrl, '_blank');
  }, [shareUrl]);

  return { shareCode, shareUrl, loading, error, createShare, copyLink, tweetShare };
}
