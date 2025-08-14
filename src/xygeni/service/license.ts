// machineFingerprint.ts
import * as os from 'os';
import * as crypto from 'crypto';
import { Commands, ILogger } from '../common/interfaces';

export const MACHINE_FINGERPRINT_FILE: string = 'fingerprint.dat';

export default class LicenseService {

  private static instance: LicenseService;

  public static getInstance(
    extensionPath?: string,
    logger?: ILogger,
    commands?: Commands
  ): LicenseService {
    if (!LicenseService.instance) {
      if (extensionPath === undefined) {
        throw new Error('Extension path are required');
      }
      if (logger === undefined) {
        throw new Error('Logger are required');
      }
      if (commands === undefined) {
        throw new Error('Commands are required');
      }
      LicenseService.instance = new LicenseService(extensionPath, logger, commands);
    }
    return LicenseService.instance;
  }

  constructor(
    private readonly extensionPath: string,
    private readonly logger: ILogger,
    private readonly commands: Commands
  ) { }

  public dispose(): void {
    this.uninstallLicense();
  }

  public async isValidLicense(): Promise<boolean> {
    const xygeniApiUrl = this.commands.getXygeniUrl();
    if (!xygeniApiUrl) {
      this.logger.log('Xygeni url not found, license cannot be checked, stopping...');
      return Promise.reject('Xygeni url not found');
    }
    return this.commands.globalFileExists(MACHINE_FINGERPRINT_FILE).then(
      (exists) => {
        if (!exists) {
          return this.generateAndEval(xygeniApiUrl);
        }
        return this.commands.readGlobalFile(MACHINE_FINGERPRINT_FILE).then(
          (fingerprint) => {
            return this.callInstallLicense(fingerprint, xygeniApiUrl);
          }
        );
      }
    )
      .catch(
        (err) => { return Promise.reject(new Error(`Error checking Xygeni IDE License: ${err.message}`)); }
      );
  }

  private generateAndEval(xygeniApiUrl: string): Promise<boolean> {
    const fingerprint = this.generateMachineFingerprint();
    this.commands.storeGlobalFile(MACHINE_FINGERPRINT_FILE, fingerprint);
    return this.callInstallLicense(fingerprint, xygeniApiUrl);
  }

  private generateMachineFingerprint(): string {
    const fingerprint = this.getMachineFingerprint();
    return JSON.stringify(fingerprint);
  }

  private async uninstallLicense(): Promise<boolean> {
    const xygeniApiUrl = this.commands.getXygeniUrl();
    if (!xygeniApiUrl) {
      return Promise.resolve(false);
    }
    return this.commands.readGlobalFile(MACHINE_FINGERPRINT_FILE).then(
      (fingerprint) => {
        return this.callUninstallLicense(fingerprint, xygeniApiUrl);
      }
    )
      .catch(
        (err) => {
          this.logger.error(err, 'Error uninstalling Xygeni IDE License');
          return Promise.resolve(false);
        }
      );
  }


  private callInstallLicense(data: any, xygeniApiUrl: string): Promise<boolean> {
    const ideLicenseUrl = `${xygeniApiUrl}/internal/license/ideaccess`;

    return new Promise<boolean>((resolve, reject) => {
      const request = this.commands.getHttpClient(ideLicenseUrl)
        .post(ideLicenseUrl, data, (res) => {
          if (res.statusCode !== 200) {
            this.logger.log(`Error checking Xygeni IDE License: ${res.statusCode}`);
            reject(new Error(`Cannot check Xygeni IDE License`));
          }
          resolve(res.statusCode === 200);
        });

      request.on('error', (error) => {
        this.logger.error(error, 'Error checking Xygeni IDE License');
        reject(new Error(`Unable to check Xygeni IDE License`));
      });
    });
  }

  private callUninstallLicense(data: any, xygeniApiUrl: string): Promise<boolean> {
    const ideLicenseUrl = `${xygeniApiUrl}/internal/license/ideaccess/uninstall`;

    return new Promise<boolean>((resolve, reject) => {
      const request = this.commands.getHttpClient(ideLicenseUrl)
        .post(ideLicenseUrl, data, (res) => {
          if (res.statusCode !== 200) {
            this.logger.log(`Error checking Xygeni IDE License: ${res.statusCode}`);
            reject(new Error(`Cannot check Xygeni IDE License`));
          }
          resolve(res.statusCode === 200);
        });

      request.on('error', (error) => {
        this.logger.error(error, 'Error checking Xygeni IDE License');
        reject(new Error(`Unable to check Xygeni IDE License`));
      });
    });
  }


  private getMachineFingerprint(): { hostname: string; platform: string, mac: string; fingerprint: string } {
    const hostname = os.hostname();
    const mac = this.getPrimaryMac();
    const platform = os.platform();
    const release = os.release();
    const arch = os.arch();
    const nodeVersion = process.version;

    const rawData = [
      hostname,
      mac || '',
      platform,
      release,
      arch
    ].join('|');

    const fingerprint = crypto
      .createHash('sha256')
      .update(rawData, 'utf8')
      .digest('hex');

    return { hostname: hostname, platform: platform, mac: (mac || ''), fingerprint: fingerprint };
  }

  private getPrimaryMac(): string | null {
    const interfaces = os.networkInterfaces();
    for (const name of Object.keys(interfaces)) {
      const netInterface = interfaces[name];
      if (!netInterface) { continue; }
      for (const net of netInterface) {
        // Skip internal and non-IPv4
        if (net.internal || net.family !== 'IPv4') continue;
        if (net.mac && net.mac !== '00:00:00:00:00:00') {
          return net.mac;
        }
      }
    }
    return null;
  }
}
