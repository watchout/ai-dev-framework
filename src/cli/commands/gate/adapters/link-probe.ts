import type { LinkProbePort } from '../ports.js';

export function makeHttpLinkProbe(): LinkProbePort {
  return {
    async head(url, opts) {
      const timeoutMs = opts?.timeoutMs ?? 5000;
      const retries = opts?.retries ?? 0;
      let lastReason = '';
      for (let attempt = 0; attempt <= retries; attempt++) {
        try {
          const controller = new AbortController();
          const timer = setTimeout(() => controller.abort(), timeoutMs);
          try {
            const res = await fetch(url, {
              method: 'HEAD',
              signal: controller.signal,
            });
            if (res.ok) return { ok: true };
            lastReason = `HTTP ${res.status}`;
          } finally {
            clearTimeout(timer);
          }
        } catch (e) {
          lastReason = e instanceof Error ? e.message : String(e);
        }
      }
      return { ok: false, reason: lastReason };
    },
  };
}

export function makeFakeLinkProbe(): LinkProbePort {
  return {
    async head() {
      return { ok: true };
    },
  };
}
