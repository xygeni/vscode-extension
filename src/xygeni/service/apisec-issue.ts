import { SingleLocationXygeniIssue, SingleLocationXygeniIssueData } from './single-location-issue';

/**
 * API Security flaw (missing authentication, BOLA, BFLA, data exposure, JWT/CORS
 * misconfigurations...), emitted by the `apisec` scan into `apisec.<suffix>`.
 *
 * Two shape differences with the SAST-family reports drive this class:
 *  - the findings live under `flaws`, not `vulnerabilities` — the rest of the report is the
 *    discovered API inventory (services / dataObjects), which is NOT a finding stream;
 *  - a flaw carries no `location`: IssuesService resolves its file from the API inventory
 *    (endpoint handler, `handler_file` property or the module spec). When none applies the
 *    flaw has no file, and the editor-bound consumers (snippet tab, diagnostics) skip it.
 *
 * The tree label (`type`) is the machine `flawType`, like every other category; the human
 * `title` (which embeds the endpoint) is shown in the details panel.
 *
 * See ticket xygeni/xygeni-product-backlog#1691.
 */
export interface ApisecXygeniIssueData extends SingleLocationXygeniIssueData {
  /** Human-readable label of the flaw, e.g. "Endpoint reachable without authentication: GET /users". */
  title?: string;
  /** HTTP method of the affected endpoint, when the flaw is endpoint-scoped. */
  endpointMethod?: string;
  /** Path of the affected endpoint, when the flaw is endpoint-scoped. */
  endpointPath?: string;
  /** Owning module, when the scanner resolved one. */
  moduleName?: string;
  /** Owning service, when the scanner resolved one. */
  serviceName?: string;
  /** OWASP API Top 10 control ids the flaw maps to. */
  owaspApiTop10?: string[];
  /** CWE ids the flaw maps to. */
  cwes?: string[];
  /** Remediation advice from the detector. */
  remediation?: string;
}

export class ApisecXygeniIssue extends SingleLocationXygeniIssue {

  title?: string;
  endpointMethod?: string;
  endpointPath?: string;
  moduleName?: string;
  serviceName?: string;
  owaspApiTop10?: string[];
  cwes?: string[];
  remediation?: string;

  constructor(issue: ApisecXygeniIssueData) {
    super(issue);
    this.title = issue.title;
    this.endpointMethod = issue.endpointMethod;
    this.endpointPath = issue.endpointPath;
    this.moduleName = issue.moduleName;
    this.serviceName = issue.serviceName;
    this.owaspApiTop10 = issue.owaspApiTop10;
    this.cwes = issue.cwes;
    this.remediation = issue.remediation;
  }

  /** `POST /users/v1/login` when endpoint-scoped, otherwise empty. */
  get endpoint(): string | undefined {
    if (!this.endpointPath) { return undefined; }
    return this.endpointMethod ? `${this.endpointMethod} ${this.endpointPath}` : this.endpointPath;
  }

  protected getDetailRowsHtml(): string {
    return `
          ${this.fieldText(this.title, 'Title')}
          ${this.fieldText(this.endpoint, 'Endpoint')}
          ${this.fieldText(this.moduleName, 'Module')}
          ${this.fieldText(this.serviceName, 'Service')}
          ${this.fieldText(this.owaspApiTop10?.join(', '), 'OWASP API Top 10')}
          ${this.fieldText(this.cwes?.join(', '), 'CWE')}`;
  }

  protected getTrailingRowsHtml(): string {
    return this.fieldMarkdown(this.remediation, 'Remediation');
  }
}
