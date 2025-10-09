/* eslint-disable curly */
import * as os from 'os';
import XygeniScannerService from "./scanner";
import { Commands, FixData, ILogger, IOutputChannel } from "../common/interfaces";
import { VulnXygeniIssue } from "./vuln-issue";


export class RemediationService {
  
  private static instance: RemediationService;

  public static getInstance(commands?: Commands, logger?: ILogger): RemediationService {
    if (!this.instance) {
      if (commands === undefined) {
        throw new Error('Commands are required');
      }
      if (logger === undefined) {
        throw new Error('Logger are required');
      }
      this.instance = new RemediationService(commands, logger);
    }
    return this.instance;
  }

  private commands: Commands;
  private logger: ILogger;

  constructor(commands: Commands, logger: ILogger) {
    this.commands = commands;
    this.logger = logger;
  }


  public async launchRemediationPreview(kind: string, issueId: string, fileUri: string, xygeniInstallPath: string, output: IOutputChannel): Promise<FixData> {
    // 'secret' | 'misconfiguration' | 'iac_flaw' | 'code_vulnerability' | 'sca_vulnerability'
    this.logger.log(`run remediation for kind ${kind}`);
    switch (kind) {
      case 'secret':
        return this._previewDiffSecretRemediation(issueId, fileUri, xygeniInstallPath, output);        
      case 'misconfiguration':
        return this._previewDiffMisconfRemediation(issueId, fileUri, xygeniInstallPath, output);
      case 'iac_flaw':
        return this._previewDiffIacRemediation(issueId, fileUri, xygeniInstallPath, output);
      case 'code_vulnerability':
        return this._previewDiffSastRemediation(issueId, fileUri, xygeniInstallPath, output);
      case 'sca_vulnerability':
        return this._previewDiffScaRemediation(issueId, fileUri, xygeniInstallPath, output);
      default:
        return { tempFile: undefined, explanation: undefined };
    }
  }

  private async _previewDiffSecretRemediation(issueId: string, fileUri: string, xygeniInstallPath: string, output: IOutputChannel): Promise<FixData> {
    return { tempFile: undefined, explanation: undefined };
  }

  private async _previewDiffMisconfRemediation(issueId: string, fileUri: string, xygeniInstallPath: string, output: IOutputChannel): Promise<FixData> {
    return { tempFile: undefined, explanation: undefined };
  }

  private async _previewDiffIacRemediation(issueId: string, fileUri: string, xygeniInstallPath: string, output: IOutputChannel): Promise<FixData> {
    return { tempFile: undefined, explanation: undefined };
  }

  private async _previewDiffSastRemediation(issueId: string, fileUri: string, xygeniInstallPath: string, output: IOutputChannel): Promise<FixData> {
    try {

      // get Dependency
      if (!issueId) return { tempFile: undefined, explanation: undefined };
      const sastIssue = this.commands.getIssues().find((i) => i.category === 'sast' && i.id === issueId) as VulnXygeniIssue;
      if (!sastIssue) {
         this.logger.log(`Issue not found: ${issueId}`);
         return Promise.reject(`Issue not found: ${issueId}`);
      }
      
      // generate temp folder and copy file
      const tempDir = os.tmpdir() + '/' + Math.floor(Math.random() * 100000);
      return this.commands.copyFileToFolder(fileUri, tempDir)
        .then(
          async (tempFile) => {

            // call scan
            const scanner = XygeniScannerService.getInstance();
            await scanner.runRectifySastCommand(tempFile, sastIssue.detector, '' + sastIssue.beginLine, xygeniInstallPath, output);

            // return fix data            
            const explanation = "No explanation available";
            return { tempFile: tempFile, explanation: explanation };

          }
        );


    } catch (error) {
      this.logger.log(`Error applying remediation: ${error}`);
      throw error;
    }
  }


  private async _previewDiffScaRemediation(issueId: string, fileUri: string, xygeniInstallPath: string, output: IOutputChannel): Promise<FixData> {    
    try {
            
      // get Dependency
      if (!issueId) return { tempFile: undefined, explanation: undefined }; 
      const vulnIssue = this.commands.getIssues().find((i) => i.category === 'sca' && i.id === issueId) as VulnXygeniIssue;   
      if (!vulnIssue) {
        this.logger.log(`Issue not found: ${issueId}`);
        return Promise.reject(`Issue not found: ${issueId}`);
      };      

      let dependencyGavt =  vulnIssue.name + ':' + vulnIssue.version + ':' + vulnIssue.language;
      if (vulnIssue.group) dependencyGavt = vulnIssue.group + ':' + dependencyGavt;
      
      // generate temp folder and copy file
      const tempDir = os.tmpdir() + '/' + Math.floor(Math.random() * 100000);
      return this.commands.copyFileToFolder(fileUri, tempDir)
      .then(
        async (tempFile) => {
                    
          // call scan
          const scanner = XygeniScannerService.getInstance();          
          await scanner.runRectifyScaCommand(tempFile, dependencyGavt, xygeniInstallPath, output);

          this.logger.log(`Sca remediation applied to ${fileUri} on ${tempFile}. Check changes before save...`);

          // return fix data          
          const explanation = "No explanation available";          
          return { tempFile: tempFile, explanation: explanation };
            
        }
      )
      .catch((error) => {
        this.logger.log(`Error applying remediation: ${error}`);
        return Promise.reject(error);
      });


    } catch (error) {
      this.logger.log(`Error applying remediation: ${error}`);
      throw error;
    }
  }

  
  
}