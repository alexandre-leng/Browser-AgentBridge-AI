import { describe, it, expect, beforeEach } from 'vitest';
import { controller } from '../src/browser/controller.js';
import { readdir, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';

describe('Screenshot Cleanup', () => {
  const screenshotsDir = join(process.cwd(), 'logs', 'screenshots');

  beforeEach(async () => {
    await mkdir(screenshotsDir, { recursive: true });
  });

  it('should delete all screenshots when closing all sessions', async () => {
    // Create dummy files
    await writeFile(join(screenshotsDir, 'shot-1-session-default.jpg'), '');
    await writeFile(join(screenshotsDir, 'shot-2-session-user1.jpg'), '');
    await writeFile(join(screenshotsDir, 'random.txt'), '');

    // Close all (passing no sessionId)
    await controller.close();

    const files = await readdir(screenshotsDir);
    // Note: random.txt should also be deleted if it doesn't have a session ID but we are closing ALL?
    // Actually my logic says: if (!sessionId || file.includes(`-session-${sessionId}.`))
    // So if !sessionId, it deletes everything in that folder.
    expect(files.length).toBe(0);
  });

  it('should only delete screenshots for a specific session', async () => {
    await writeFile(join(screenshotsDir, 'shot-1-session-user1.jpg'), '');
    await writeFile(join(screenshotsDir, 'shot-2-session-user2.jpg'), '');

    // Close user1
    await controller.close('user1');

    const files = await readdir(screenshotsDir);
    expect(files).toContain('shot-2-session-user2.jpg');
    expect(files).not.toContain('shot-1-session-user1.jpg');
  });
});
