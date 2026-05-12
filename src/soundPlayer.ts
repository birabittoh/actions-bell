import * as vscode from 'vscode';
import * as child_process from 'child_process';
import * as path from 'path';

export class SoundPlayer implements vscode.Disposable {
  constructor(private extensionPath: string) {}

  playSuccess() { this.play('success'); }
  playFailure() { this.play('failure'); }

  private play(type: 'success' | 'failure') {
    const cfg = vscode.workspace.getConfiguration('actionsBell');
    if (!cfg.get<boolean>('sound.enabled', false)) return;

    const customCmd = cfg.get<string>(`sound.${type}Command`, '');
    if (customCmd) {
      child_process.exec(customCmd, { timeout: 5000 }, err => {
        if (err) console.error('[Actions Bell] sound command failed:', err.message);
      });
      return;
    }

    const isWSL = process.platform === 'linux' && !!process.env.WSL_DISTRO_NAME;

    if (isWSL || process.platform === 'win32') {
      // Use Windows system sounds — no file path needed
      const sound = type === 'success' ? 'Asterisk' : 'Exclamation';
      const cmd = isWSL
        ? `powershell.exe -NoProfile -c "[System.Media.SystemSounds]::${sound}.Play()"`
        : `powershell -NoProfile -c "[System.Media.SystemSounds]::${sound}.Play()"`;
      child_process.exec(cmd, { timeout: 5000 }, () => {});
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
