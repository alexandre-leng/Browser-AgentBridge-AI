import { describe, it, expect, vi } from 'vitest';
import {
  estimateHumanConsultationMs,
  getHumanTimingProfile,
  humanMove,
  humanType,
  rand,
  randInt,
  resetHumanTimingProfile,
  updateHumanTimingProfile,
} from '../src/browser/human.js';

describe('human utilities', () => {
  it('rand should stay within bounds', () => {
    for (let i = 0; i < 100; i++) {
      const v = rand(10, 20);
      expect(v).toBeGreaterThanOrEqual(10);
      expect(v).toBeLessThanOrEqual(20);
    }
  });

  it('randInt should stay within bounds', () => {
    for (let i = 0; i < 100; i++) {
      const v = randInt(10, 20);
      expect(Number.isInteger(v)).toBe(true);
      expect(v).toBeGreaterThanOrEqual(10);
      expect(v).toBeLessThanOrEqual(20);
    }
  });

  it('humanMove should call mouse.move multiple times', async () => {
    const mockPage = {
      mouse: {
        move: vi.fn().mockResolvedValue(undefined)
      }
    } as any;

    await humanMove(mockPage, 100, 100, 0, 0);
    expect(mockPage.mouse.move.mock.calls.length).toBeGreaterThan(1);
    // Last call should be close to destination
    const lastCall = mockPage.mouse.move.mock.calls[mockPage.mouse.move.mock.calls.length - 1];
    expect(lastCall[0]).toBeCloseTo(100, 0);
    expect(lastCall[1]).toBeCloseTo(100, 0);
  });

  it('humanType should call keyboard.type for each character', async () => {
    const mockPage = {
      keyboard: {
        type: vi.fn().mockResolvedValue(undefined)
      }
    } as any;

    await humanType(mockPage, 'hello');
    expect(mockPage.keyboard.type).toHaveBeenCalledTimes(5);
    expect(mockPage.keyboard.type).toHaveBeenNthCalledWith(1, 'h', { delay: 0 });
  });

  it('estimateHumanConsultationMs should increase with text length', () => {
    vi.stubEnv('BRIDGE_HUMAN_CONSULT_SPEED', '1');
    resetHumanTimingProfile();
    const shortText = 'Petit paragraphe.';
    const longText = Array(120).fill('mot').join(' ');

    const shortDuration = estimateHumanConsultationMs(shortText);
    const longDuration = estimateHumanConsultationMs(longText);

    expect(shortDuration).toBeGreaterThanOrEqual(900);
    expect(longDuration).toBeGreaterThan(shortDuration);
    vi.unstubAllEnvs();
  });

  it('human timing profile should be adjustable at runtime', () => {
    const original = resetHumanTimingProfile();
    const updated = updateHumanTimingProfile({ consultSpeed: 2, minFocusedMs: 5000, feedbackIntervalMs: 600 });

    expect(updated.consultSpeed).toBe(2);
    expect(updated.minFocusedMs).toBe(5000);
    expect(updated.feedbackIntervalMs).toBe(600);
    expect(getHumanTimingProfile()).toEqual(updated);

    expect(resetHumanTimingProfile()).toEqual(original);
  });
});
