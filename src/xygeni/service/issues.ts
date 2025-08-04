import { XYGENI_SCANNER_REPORT_SUFFIX } from '../common/constants';
import { ILogger, EventEmitter, Commands } from '../common/interfaces';
import { IacXygeniIssue } from './iac-issue';
import { MisconfXygeniIssue } from './misconf-issue';
import { SastXygeniIssue } from './sast-issue';
import { SecretsXygeniIssue } from './secrets-issue';
import { DepsXygeniIssue } from './vuln-issue';
import { VulnerabilitiesService } from './vulnerabilities';
import { XygeniIssue } from '../common/interfaces';


export default class IssuesService {

  private static instance: IssuesService;

  private readonly xygeniGetDetectorDocUrl = '/internal/policy/detector/doc';

  public static getInstance(logger?: ILogger, emitter?: EventEmitter, commands?: Commands): IssuesService {
    if (!IssuesService.instance) {
      if (logger === undefined) {
        throw new Error('Logger are required');
      }
      if (emitter === undefined) {
        throw new Error('Emitter are required');
      }
      if (commands === undefined) {
        throw new Error('Commands are required');
      }
      IssuesService.instance = new IssuesService(logger, emitter, commands);
    }
    return IssuesService.instance;
  }

  getIssues(): XygeniIssue[] {
    return this.issues;
  }

  getIssuesByCategory(category: string): XygeniIssue[] {
    return this.issues.filter(issue => issue.category === category);
  }

  private constructor(
    private readonly logger: ILogger,
    private readonly emitter: EventEmitter,
    private readonly commands: Commands) {
  }

  private issues: XygeniIssue[] = [];
  private isReadingIssues = false;


  public async readIssues(): Promise<void> {
    if (this.isReadingIssues) {
      this.logger.log('Issues are already being read, skipping...');
      return;
    }

    this.isReadingIssues = true;
    this.issues = [];

    this.logger.log("");
    this.logger.log("==================================================");
    this.logger.log("  Reading issues...");

    try {
      await this.readScannerOutput(XYGENI_SCANNER_REPORT_SUFFIX);

      this.logger.log("  " + this.issues.length + " issues read.");
      this.logger.log("==================================================");
      this.emitter.emitChange();

    } catch (error) {
      this.logger.error(error, 'Error reading issues output');
      this.emitter.emitChange();
    } finally {
      this.isReadingIssues = false;
    }
  }


  public async readScannerOutput(suffix: string): Promise<void> {
    try {
      // read secrets
      await this.readSecretsReport(`secrets.${suffix}`);

      // read misconf
      await this.readMisconfReport(`misconf.${suffix}`);

      // read sast
      await this.readSastReport(`sast.${suffix}`);

      await this.readIacReport(`iac.${suffix}`);

      await this.readDepsReport(`deps.${suffix}`);

      // sort issues by severity
      this.issues.sort((a, b) => {
        return a.getSeverityLevel() - b.getSeverityLevel();
      });

    } catch (error) {
      this.logger.error(error, 'Error reading scanner output:');
      throw error;
    }
  }



  public async readMisconfReport(filename: string): Promise<void> {
    if (!(await this.commands.fileExists(filename))) {
      //this.logger.log(`Misconf report file ${filename} does not exist, skipping...`);
      return;
    }


    try {
      const data = await this.commands.readFile(filename);
      const rawData = JSON.parse(data);
      this.processMisconfReport(rawData);
    } catch (error) {
      this.logger.error(error, 'Error reading misconf output:');
      throw error;
    }
  }

  public async readSastReport(filename: string): Promise<void> {
    if (!(await this.commands.fileExists(filename))) {
      //this.logger.log(`SAST report file ${filename} does not exist, skipping...`);
      return;
    }

    try {
      const data = await this.commands.readFile(filename);
      const rawData = JSON.parse(data);
      this.processSastReport(rawData);
    } catch (error) {
      this.logger.error(error, 'Error reading sast output:');
      throw error;
    }
  }

  public async readIacReport(filename: string): Promise<void> {
    if (!(await this.commands.fileExists(filename))) {
      //this.logger.log(`IAC report file ${filename} does not exist, skipping...`);
      return;
    }

    try {
      const data = await this.commands.readFile(filename);
      const rawData = JSON.parse(data);
      this.processIacReport(rawData);
    } catch (error) {
      this.logger.error(error, 'Error reading iac output:');
      throw error;
    }
  }

  public async readDepsReport(filename: string): Promise<void> {
    if (!(await this.commands.fileExists(filename))) {
      // this.logger.log(`Deps report file ${filename} does not exist, skipping...`);
      return;
    }

    try {
      const data = await this.commands.readFile(filename);
      const rawData = JSON.parse(data);
      await this.processDepsReport(rawData);
    } catch (error) {
      this.logger.error(error, 'Error reading deps output:');
      throw error;
    }
  }

  public async readSecretsReport(filename: string): Promise<void> {
    if (!(await this.commands.fileExists(filename))) {
      //this.logger.log(`Secrets report file ${filename} does not exist, skipping...`);
      return;
    }

    try {
      const data = await this.commands.readFile(filename);
      const rawData = JSON.parse(data);
      this.processSecretsReport(rawData);
    } catch (error) {
      this.logger.error(error, 'Error reading secrets output:');
      throw error;
    }
  }

  async processDepsReport(jsonRaw: any): Promise<void> {
    const dependencies = Array.isArray(jsonRaw.dependencies) ? jsonRaw.dependencies : [jsonRaw.dependencies];
    const tool = jsonRaw.metadata.reportProperties['tool.name'];

    const dependenciesByGavt = new Map<string, any>();

    dependencies.forEach((dep: any) => {
      const gavt = `${dep.group}:${dep.name}:${dep.version}:${dep.language}`;
      dependenciesByGavt.set(gavt, dep);
    });

    return VulnerabilitiesService.getInstance().getVulnerabilities(dependenciesByGavt, (dep, vuln) => {

      // for each vulnerability, create an issue      
      const issue = new DepsXygeniIssue({
        id: vuln.cve,
        type: vuln.cve,
        virtual: dep.virtual,
        detector: vuln.cve,
        tool: tool,
        kind: 'sca_vulnerability',
        repositoryType: dep.repositoryType,
        displayFileName: dep.displayFileName,
        group: dep.group,
        name: dep.name,
        version: dep.version,
        dependencyPaths: dep.paths.dependencyPaths,
        directDependency: dep.paths.directDependencyPaths,
        severity: vuln.severity,
        confidence: dep.confidence ? dep.confidence as 'highest' | 'high' | 'medium' | 'low' : 'high',
        category: 'sca',
        categoryName: 'Vulnerability',
        file: dep.location ? dep.location.filepath ? dep.location.filepath : '' : dep.fileName ? dep.fileName : dep.displayFileName,
        line: dep.location ? dep.location.beginLine ? dep.location.beginLine : 0 : 0,
        description: vuln.description ? vuln.description : 'Vulnerability ' + vuln.cve,
        tags: dep.tags?.length > 0 ? dep.tags : undefined,
      });
      this.issues.push(issue);
    });
  }


  processSecretsReport(jsonRaw: any): void {
    const secrets = Array.isArray(jsonRaw.secrets) ? jsonRaw.secrets : [jsonRaw.secrets];
    const tool = jsonRaw.metadata.reportProperties['tool.name'];

    secrets.forEach((rawSecret: any) => {
      const issue = new SecretsXygeniIssue({
        id: rawSecret.issueId,
        type: rawSecret.type,
        hash: rawSecret.hash,
        detector: rawSecret.detector,
        tool: tool,
        kind: 'secret',
        severity: rawSecret.severity as 'critical' | 'high' | 'medium' | 'low' | 'info',
        confidence: rawSecret.confidence ? rawSecret.confidence as 'highest' | 'high' | 'medium' | 'low' : 'high',
        resource: rawSecret.resource ? rawSecret.resource : '',
        foundBy: rawSecret.detector ? rawSecret.detector : '',
        category: 'secrets',
        categoryName: 'Secret',
        file: rawSecret.location ? rawSecret.location.filepath ? rawSecret.location.filepath : '' : '',
        line: rawSecret.location ? rawSecret.location.beginLine ? rawSecret.location.beginLine : 0 : 0,
        code: rawSecret.location ? rawSecret.location.code ? rawSecret.location.code : '' : '',
        description: `Secret of type '${rawSecret.type}' detected by '${rawSecret.detector}'`,
        tags: rawSecret.tags?.length > 0 ? rawSecret.tags : undefined,
      });
      this.issues.push(issue);

    });
  }

  processSastReport(jsonRaw: any): void {
    const sast_vuln = Array.isArray(jsonRaw.vulnerabilities) ? jsonRaw.vulnerabilities : [jsonRaw.vulnerabilities];
    const tool = jsonRaw.metadata.reportProperties['tool.name'];

    sast_vuln.forEach((raw_vuln: any) => {
      const issue = new SastXygeniIssue({
        id: raw_vuln.issueId,
        type: raw_vuln.kind,
        detector: raw_vuln.detector,
        tool: tool,
        kind: 'code_vulnerability',
        severity: raw_vuln.severity as 'critical' | 'high' | 'medium' | 'low' | 'info',
        confidence: raw_vuln.confidence ? raw_vuln.confidence as 'highest' | 'high' | 'medium' | 'low' : 'high',
        category: 'sast',
        categoryName: 'SAST',
        file: raw_vuln.location ? raw_vuln.location.filepath ? raw_vuln.location.filepath : '' : '',
        line: raw_vuln.location ? raw_vuln.location.beginLine ? raw_vuln.location.beginLine : 0 : 0,
        code: raw_vuln.location ? raw_vuln.location.code ? raw_vuln.location.code : '' : '',
        description: raw_vuln.explanation
      });
      this.issues.push(issue);
    });
  }

  processMisconfReport(jsonRaw: any): void {

    const misconfigurations = Array.isArray(jsonRaw.misconfigurations) ? jsonRaw.misconfigurations : [jsonRaw.misconfigurations];
    const tool = jsonRaw.metadata.reportProperties['tool.name'];

    misconfigurations.forEach((rawMisconf: any) => {
      const issue = new MisconfXygeniIssue({
        id: rawMisconf.issueId,
        type: rawMisconf.type,
        detector: rawMisconf.detector,
        tool: tool,
        kind: 'misconfiguration',
        severity: rawMisconf.severity as 'critical' | 'high' | 'medium' | 'low' | 'info',
        confidence: rawMisconf.confidence ? rawMisconf.confidence as 'highest' | 'high' | 'medium' | 'low' : 'high',
        category: 'misconf',
        categoryName: 'Misconfiguration',
        tool_kind: rawMisconf.properties ? rawMisconf.properties.tool_kind ? rawMisconf.properties.tool_kind : '' : '',
        file: rawMisconf.location ? rawMisconf.location.filepath ? rawMisconf.location.filepath : '' : '',
        line: rawMisconf.location ? rawMisconf.location.beginLine ? rawMisconf.location.beginLine : 0 : 0,
        code: rawMisconf.location ? rawMisconf.location.code ? rawMisconf.location.code : '' : '',
        description: rawMisconf.explanation
      });
      this.issues.push(issue);
    });

  }


  processIacReport(jsonRaw: any): void {

    const flaws = Array.isArray(jsonRaw.flaws) ? jsonRaw.flaws : [jsonRaw.flaws];
    const tool = jsonRaw.metadata.reportProperties['tool.name'];

    flaws.forEach((flaw: any) => {
      const issue = new IacXygeniIssue({
        id: flaw.issueId,
        type: flaw.type,
        detector: flaw.detector,
        tool: tool,
        kind: 'iac_flaw',
        severity: flaw.severity as 'critical' | 'high' | 'medium' | 'low' | 'info',
        confidence: flaw.confidence ? flaw.confidence as 'highest' | 'high' | 'medium' | 'low' : 'high',
        resource: flaw.resource ? flaw.resource : '',
        provider: flaw.provider ? flaw.provider : '',
        foundBy: flaw.detector ? flaw.detector : '',
        category: 'iac',
        categoryName: 'IaC',
        file: flaw.location ? flaw.location.filepath ? flaw.location.filepath : '' : '',
        line: flaw.location ? flaw.location.beginLine ? flaw.location.beginLine : 0 : 0,
        code: flaw.location ? flaw.location.code ? flaw.location.code : '' : '',
        tags: flaw.tags?.length > 0 ? flaw.tags : undefined,
        description: flaw.explanation
      });
      this.issues.push(issue);
    });

  }


  async getDetectorDoc(url: URL, token: string): Promise<string> {
    return new Promise(async (resolve, reject) => {
      const client = this.commands.getHttpClient(url.toString());
      if (!token) {
        this.logger.log('   Xygeni token not found, skipping vuln retrieve...');
        return reject('token_not_found');
      }
      client.setAuthToken(token);
      client.get(url.toString(), (res) => {
        let doc = '';
        res.on('data', (chunk) => {
          doc += chunk;
        });
        res.on('end', () => {
          if (doc.indexOf('detector_not_found') > -1) {
            return reject('detector_not_found');
          }
          try {
            return resolve(doc);
          }
          catch (e: any) {
            return reject(new Error('Error reading detector doc. ' + e.message));
          }
        });
      }).on('error', (err) => {
        this.logger.error(err, 'Error loading issue doc');
        reject(err);
      });

    });
  }


  clear(): void {
    this.issues = [];
  }

}

export type XygeniIssueType = SastXygeniIssue | IacXygeniIssue | MisconfXygeniIssue | SecretsXygeniIssue;






