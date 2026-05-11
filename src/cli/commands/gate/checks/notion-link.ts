import type { CheckContext } from '../validate-spec.js';
import type { Finding } from '../ports.js';

const NOTION_RE = /https?:\/\/(?:www\.)?notion\.so\/[^\s)]+/g;
const REFERENCED_LABEL = /\[文献確認:[^\]]*\]/;

export async function runNotionLink(ctx: CheckContext): Promise<Finding[]> {
  const files = await ctx.ports.spec.list();
  const findings: Finding[] = [];
  for (const f of files) {
    const lines = f.content.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const urls = line.match(NOTION_RE);
      if (!urls) continue;
      const context = [
        lines[i - 1] ?? '',
        line,
        lines[i + 1] ?? '',
      ].join('\n');
      const hasLabel = REFERENCED_LABEL.test(context);
      for (const url of urls) {
        if (!hasLabel) {
          findings.push({
            check: 'notion-link',
            severity: 'warn',
            files: [f.path],
            message: `F6: Notion link ${url} missing [文献確認: ...] label nearby`,
            line: i + 1,
          });
        }
        try {
          const probe = await ctx.ports.link.head(url, { timeoutMs: 5000, retries: 1 });
          if (!probe.ok) {
            findings.push({
              check: 'notion-link',
              severity: 'warn',
              files: [f.path],
              message: `F6: Notion link unreachable: ${url}${probe.reason ? ` (${probe.reason})` : ''}`,
              line: i + 1,
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
  }
  return findings;
}
