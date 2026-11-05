import { SingleLocationXygeniIssue, SingleLocationXygeniIssueData } from './single-location-issue';

/**
 * AI Security finding (OWASP LLM Top 10 / Agentic ASI + red-team vectors), emitted by the
 * `ai` scan into `ai.<suffix>`.
 *
 * The AI report is NOT shaped like the SAST/quality ones: `AIVulnerability` serializes
 * `severityFloor` (its `getSeverity()` is @JsonIgnore), `detectorId`, `description` and `id`,
 * and carries no `kind`/`type` field at all. The mapping in IssuesService is what bridges those
 * names; this class only renders what the report actually provides.
 *
 * See ticket xygeni/xygeni-product-backlog#1692.
 */
export interface AiXygeniIssueData extends SingleLocationXygeniIssueData {
  /** AI asset kind the finding applies to (e.g. `ai_prompt`, `ai_agent`), when the inventory produced one. */
  assetKind?: string;
  /** Canonical taxonomy tags (OWASP LLM / ASI / AST), already materialized by the scanner. */
  standards?: string[];
  /** Red-team attack vectors (Jailbreaks, PromptInjection, ...). */
  redTeamVectors?: string[];
  /** Free-text remediation advice from the detector, when present. */
  remediationHint?: string;
}

export class AiXygeniIssue extends SingleLocationXygeniIssue {

  assetKind?: string;
  standards?: string[];
  redTeamVectors?: string[];
  remediationHint?: string;

  constructor(issue: AiXygeniIssueData) {
    super(issue);
    this.assetKind = issue.assetKind;
    this.standards = issue.standards;
    this.redTeamVectors = issue.redTeamVectors;
    this.remediationHint = issue.remediationHint;
  }

  protected getDetailRowsHtml(): string {
    return `
          ${this.fieldText(this.assetKind, 'AI Asset')}
          ${this.fieldText(this.standards?.join(', '), 'Standards')}
          ${this.fieldText(this.redTeamVectors?.join(', '), 'Red Team Vectors')}`;
  }

  protected getTrailingRowsHtml(): string {
    return this.fieldMarkdown(this.remediationHint, 'Remediation');
  }
}
