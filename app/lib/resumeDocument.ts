/**
 * Structured Resume Document (FR-1.4 / FR-1.5 / FR-2.4)
 * ======================================================
 * Replaces the old "150-word summary paragraph" output with a full,
 * sectioned resume document:
 *   - Strict JSON schema the LLM must fill
 *   - Validation with actionable error strings (drives quality retries)
 *   - Markdown renderer used for on-screen display and .md download
 *   - Contact header injected from user-provided metadata (never invented)
 */

export interface ResumeContact {
  name: string;
  email: string;
  phone: string;
}

export interface ResumeExperienceItem {
  role: string;
  organization: string;
  period: string;
  achievements: string[];
}

export interface ResumeDocument {
  headline: string;
  summary: string;
  skills: string[];
  experience: ResumeExperienceItem[];
  education: string[];
  certifications: string[];
}

export const RESUME_JSON_INSTRUCTIONS = `Return STRICT JSON (no markdown fences, no commentary) with this exact shape:
{
  "headline": "one-line professional headline targeting the role",
  "summary": "3-5 sentence professional summary, 60-120 words, concrete and metric-driven where possible",
  "skills": ["8-14 skills, most job-relevant first"],
  "experience": [
    {
      "role": "job title",
      "organization": "company/org (use candidate-provided info; if unknown write 'Independent / Various')",
      "period": "duration or dates if known, else approximate e.g. '5 years'",
      "achievements": ["2-4 bullet points, action-verb first, quantified where the profile supports it"]
    }
  ],
  "education": ["degrees/programs if present in the profile, else empty array"],
  "certifications": ["certifications explicitly present in the profile, else empty array"]
}
HARD RULES:
- NEVER invent employers, dates, degrees, or certifications not supported by the profile text.
- Do not include name/email/phone in any field (the app injects contact info separately).
- experience must contain at least 1 entry synthesized from the profile.`;

/** Parse + validate LLM output. Returns the document or a string describing the defect. */
export function parseResumeDocument(raw: string): ResumeDocument | string {
  let cleaned = (raw || '').trim();
  // Tolerate accidental code fences
  cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');

  let parsed: any;
  try {
    parsed = JSON.parse(cleaned);
  } catch (e) {
    return `invalid-json: ${e instanceof Error ? e.message : String(e)}`;
  }

  if (typeof parsed !== 'object' || parsed === null) return 'not-an-object';
  if (typeof parsed.headline !== 'string' || !parsed.headline.trim()) return 'missing-headline';
  if (typeof parsed.summary !== 'string' || parsed.summary.trim().split(/\s+/).length < 25) {
    return 'summary-too-short(<25 words)';
  }
  if (!Array.isArray(parsed.skills) || parsed.skills.length < 4) return 'skills-too-few(<4)';
  if (!Array.isArray(parsed.experience) || parsed.experience.length < 1) return 'experience-empty';

  for (const [i, exp] of (parsed.experience as any[]).entries()) {
    if (typeof exp?.role !== 'string' || !exp.role.trim()) return `experience[${i}]-missing-role`;
    if (!Array.isArray(exp?.achievements) || exp.achievements.length < 1) {
      return `experience[${i}]-missing-achievements`;
    }
  }

  return {
    headline: parsed.headline.trim(),
    summary: parsed.summary.trim(),
    skills: parsed.skills.map((s: unknown) => String(s).trim()).filter(Boolean),
    experience: (parsed.experience as any[]).map((e) => ({
      role: String(e.role || '').trim(),
      organization: String(e.organization || 'Independent / Various').trim(),
      period: String(e.period || '').trim(),
      achievements: (Array.isArray(e.achievements) ? e.achievements : [])
        .map((a: unknown) => String(a).trim())
        .filter(Boolean),
    })),
    education: (Array.isArray(parsed.education) ? parsed.education : [])
      .map((s: unknown) => String(s).trim())
      .filter(Boolean),
    certifications: (Array.isArray(parsed.certifications) ? parsed.certifications : [])
      .map((s: unknown) => String(s).trim())
      .filter(Boolean),
  };
}

/** Render the document as Markdown (screen display + .md download). */
export function renderResumeMarkdown(
  doc: ResumeDocument,
  contact: ResumeContact,
  disclaimer?: string,
): string {
  const lines: string[] = [];

  const name = contact.name.trim() || 'Your Name';
  lines.push(`# ${name}`);
  lines.push(`**${doc.headline}**`);

  const contactBits = [contact.email.trim(), contact.phone.trim()].filter(Boolean);
  if (contactBits.length) lines.push(contactBits.join(' | '));
  lines.push('');

  if (disclaimer) {
    lines.push(`> ${disclaimer}`);
    lines.push('');
  }

  lines.push('## Professional Summary');
  lines.push(doc.summary);
  lines.push('');

  lines.push('## Skills');
  lines.push(doc.skills.join(' · '));
  lines.push('');

  lines.push('## Experience');
  for (const exp of doc.experience) {
    const meta = [exp.organization, exp.period].filter(Boolean).join(' — ');
    lines.push(`### ${exp.role}${meta ? ` (${meta})` : ''}`);
    for (const a of exp.achievements) lines.push(`- ${a}`);
    lines.push('');
  }

  if (doc.education.length) {
    lines.push('## Education');
    for (const e of doc.education) lines.push(`- ${e}`);
    lines.push('');
  }

  if (doc.certifications.length) {
    lines.push('## Certifications');
    for (const c of doc.certifications) lines.push(`- ${c}`);
    lines.push('');
  }

  return lines.join('\n').trim() + '\n';
}

// --- ATS Match Report -------------------------------------------------------

export interface AtsReport {
  /** 0-100 semantic similarity between profile and target */
  matchScore: number;
  /** Target keywords found in the profile */
  matchedKeywords: string[];
  /** Target keywords absent from the profile — the "add these" list */
  missingKeywords: string[];
}

const STOPWORDS = new Set([
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'by', 'for', 'from', 'has', 'have',
  'in', 'is', 'it', 'its', 'of', 'on', 'or', 'our', 'that', 'the', 'their',
  'this', 'to', 'we', 'will', 'with', 'you', 'your', 'years', 'year', 'experience',
  'strong', 'skills', 'ability', 'etc', 'plus', 'must', 'required', 'requirements',
  'see', 'listing', 'details', 'work', 'working', 'team', 'good', 'excellent',
]);

const keywordTokens = (text: string): string[] => {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of (text || '').toLowerCase().split(/[^a-z0-9+#.]+/)) {
    const t = raw.replace(/^[.#+]+|[.#+]+$/g, (m) => (raw.length <= 3 ? m : ''));
    if (t.length < 2 || STOPWORDS.has(t) || /^\d+$/.test(t)) continue;
    if (!seen.has(t)) {
      seen.add(t);
      out.push(t);
    }
  }
  return out;
};

/**
 * Keyword-level ATS gap analysis (deterministic, client-side).
 * `similarity` should come from the embedding cosine similarity (0..1).
 */
export function buildAtsReport(profileText: string, targetText: string, similarity: number): AtsReport {
  const profileTokens = new Set(keywordTokens(profileText));
  const targetKeywords = keywordTokens(targetText);

  const matched: string[] = [];
  const missing: string[] = [];
  for (const kw of targetKeywords) {
    (profileTokens.has(kw) ? matched : missing).push(kw);
  }

  return {
    matchScore: Math.round(Math.max(0, Math.min(1, similarity)) * 100),
    matchedKeywords: matched.slice(0, 20),
    missingKeywords: missing.slice(0, 12),
  };
}
