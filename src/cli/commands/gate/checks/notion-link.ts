import type { CheckContext } from '../validate-spec.js';
import type { Finding } from '../ports.js';

const NOTION_RE = /https?:\/\/(?:www\.)?notion\.so\/[^\s)]+/g;

export async function runNotionLink(ctx: CheckContext): Promise<Finding[]> {
  const files = await ctx.ports.spec.list();
  const findings: Finding[] = [];
  for (const f of files) {
    const urls = f.content.match(NOTION_RE) ?? [];
    for (const url of urls) {
      try {
        const probe = await ctx.ports.link.head(url, { timeoutMs: 5000, retries: 1 });
        if (!probe.ok) {
          findings.push({
            check: 'notion-link',
            severity: 'warn',
            files: [f.path],
            message: `F6: Notion link unreachable: ${url}${probe.reason ? ` (${probe.reason})` : ''}`,
          });
        }
      } catch (e) {
        findings.push({
          check: 'port-failure',
          severity: 'warn',
          files: [f.path],
          message: `link port failure for ${url}: ${e instanceof Error ? e.message : String(e)}`,
        });
      }
    }
  }
  return findings;
}
