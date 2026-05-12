import * as vscode from 'vscode';
import * as child_process from 'child_process';
import * as path from 'path';

export class SoundPlayer implements vscode.Disposable {
  constructor(private extensionPath: string) {}

  playSuccess() { this.play('success'); }
  playFailure() { this.play('failure'); }

  private play(type: 'success' | 'failure') {
    const cfg = vscode.workspace.getConfiguration('actionsBell');
    if (!cfg.get<boolean>('sound.enabled', true)) return;

    const customCmd = cfg.get<string>(`sound.${type}Command`, '');
    if (customCmd) {
      child_process.exec(customCmd, { timeout: 5000 }, err => {
        if (err) console.error('[Actions Bell] sound command failed:', err.message);
      });
      return;
    }

    const isWSL = process.platform === 'linux' && !!process.env.WSL_DISTRO_NAME;

    if (isWSL) {
      const bundled = path.join(this.extensionPath, 'media', `${type}.wav`);
      child_process.exec(`wslpath -w "${bundled}"`, (err, winPath) => {
        if (err) return;
        const p = winPath.trim();
        child_process.exec(
          `powershell.exe -NoProfile -c "(New-Object Media.SoundPlayer '${p}').PlaySync()"`,
          { timeout: 5000 }, () => {}
        );
      });
    } else if (process.platform === 'win32') {
      const bundled = path.join(this.extensionPath, 'media', `${type}.wav`);
      child_process.exec(
        `powershell -NoProfile -c "(New-Object Media.SoundPlayer '${bundled}').PlaySync()"`,
        { timeout: 5000 }, () => {}
      );
    } else if (process.platform === 'darwin') {
      const sound = type === 'success' ? 'Glass' : 'Basso';
      child_process.exec(`afplay /System/Library/Sounds/${sound}.aiff`, { timeout: 5000 }, () => {});
    } else {
      // Plain Linux — try PulseAudio freedesktop sounds, fall back to bundled WAV
      const bundled = path.join(this.extensionPath, 'media', `${type}.wav`);
      const freeSound = type === 'success'
        ? '/usr/share/sounds/freedesktop/stereo/complete.oga'
        : '/usr/share/sounds/freedesktop/stereo/dialog-error.oga';
      child_process.exec(
        `paplay "${freeSound}" 2>/dev/null || aplay "${bundled}" 2>/dev/null || true`,
        { timeout: 5000 }, () => {}
      );
    }
  }

  dispose() {}
}
