import { readFileSync } from 'node:fs';
const f = process.argv[2] || 'SPEC.md';
let txt;
try { txt = readFileSync(f, 'utf8'); } catch { console.error(`G1 BLOCK: ${f} not found at repo root`); process.exit(1); }
const m = txt.match(/^---\n([\s\S]*?)\n---/);
if (!m) { console.error('G1 BLOCK: no YAML front-matter in SPEC.md'); process.exit(1); }
const fm = m[1];
const errs = [];
const need = ['schema_version','canonical_core','owner','default_risk','current_phase','protected_surfaces','domain_or_contracts','repo_non_goals','roles'];
for (const k of need) if (!new RegExp(`^${k}:`, 'm').test(fm)) errs.push(`missing key: ${k}`);
if (!/^schema_version:\s*shirube-repo-spec\/v1\s*$/m.test(fm)) errs.push('schema_version must be shirube-repo-spec/v1');
if (!/^canonical_core:\s*\S*company-dev-os\S*@\S+/m.test(fm)) errs.push('canonical_core must reference company-dev-os and be version-pinned (contain @)');
if (!/^default_risk:\s*R[0-4]\b/m.test(fm)) errs.push('default_risk must be R0..R4');
const rb = (fm.match(/^roles:\n([\s\S]*?)(?=^\S|$)/m) || [,''])[1];
const roles = ['spec','arc','design_reviewer','impl_runner','impl_reviewer','release_owner'];
for (const r of roles) if (!new RegExp(`^\\s+${r}:\\s*\\S`, 'm').test(rb)) errs.push(`roles.${r} missing or empty`);
const get = (k) => { const mm = rb.match(new RegExp(`^\\s+${k}:\\s*(\\S.*)$`, 'm')); return mm ? mm[1].trim() : ''; };
const warns = [];
if (get('design_reviewer') && get('design_reviewer') === get('arc')) warns.push('WARN: design_reviewer == arc (maker == checker)');
if (get('impl_reviewer') && get('impl_reviewer') === get('impl_runner')) warns.push('WARN: impl_reviewer == impl_runner (maker == checker)');
warns.forEach(w => console.log(w));
if (errs.length) { console.error('G1 BLOCK:\n - ' + errs.join('\n - ')); process.exit(1); }
console.log('G1 PASS: SPEC.md valid' + (warns.length ? ' (with WARN above)' : ''));
