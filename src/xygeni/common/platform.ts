import * as os from 'os';
import * as fs from 'fs';
import * as path from 'path';

export class Platform {
  public static get(): string {
    return os.platform();
  }

  /**
   * Resolve an absolute path to a working PowerShell executable on Windows.
   * Returns undefined if none is found. The caller should pass `process.env`
   * and `fs.existsSync` (or test doubles).
   *
   * Order: Windows PowerShell 5.1 (System32) -> Sysnative (32-bit Node on
   * 64-bit Windows) -> PowerShell 7 (pwsh.exe) in common install dirs ->
   * manual PATH scan.
   */
  public static resolveWindowsShell(
    env: NodeJS.ProcessEnv = process.env,
    exists: (p: string) => boolean = fs.existsSync,
  ): { path: string; probed: string[] } | { path: undefined; probed: string[] } {
    const probed: string[] = [];
    const tryPath = (p: string | undefined): string | undefined => {
      if (!p) {
        return undefined;
      }
      probed.push(p);
      return exists(p) ? p : undefined;
    };

    const systemRoot = env.SystemRoot || (env.SystemDrive ? env.SystemDrive + '\\Windows' : 'C:\\Windows');
    const ps51Rel = '\\System32\\WindowsPowerShell\\v1.0\\powershell.exe';
    const sysnativeRel = '\\Sysnative\\WindowsPowerShell\\v1.0\\powershell.exe';

    let found = tryPath(systemRoot + ps51Rel);
    if (!found) {
      found = tryPath(systemRoot + sysnativeRel);
    }

    if (!found) {
      const programFiles = env.ProgramFiles || 'C:\\Program Files';
      const programFilesX86 = env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)';
      const localAppData = env.LOCALAPPDATA;
      const pwshCandidates = [
        path.win32.join(programFiles, 'PowerShell', '7', 'pwsh.exe'),
        path.win32.join(programFilesX86, 'PowerShell', '7', 'pwsh.exe'),
      ];
      if (localAppData) {
        pwshCandidates.push(path.win32.join(localAppData, 'Microsoft', 'PowerShell', '7', 'pwsh.exe'));
      }
      for (const candidate of pwshCandidates) {
        found = tryPath(candidate);
        if (found) {
          break;
        }
      }
    }

    if (!found && env.PATH) {
      const pathEntries = env.PATH.split(';').filter(Boolean);
      const exeNames = ['powershell.exe', 'pwsh.exe'];
      outer: for (const dir of pathEntries) {
        for (const exe of exeNames) {
          const candidate = path.win32.join(dir, exe);
          found = tryPath(candidate);
          if (found) {
            break outer;
          }
        }
      }
    }

    return found ? { path: found, probed } : { path: undefined, probed };
  }
}
