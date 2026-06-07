import { describe, it, expect } from 'vitest';
import {
  createSideDetailPanelTimeline,
  createBottomSheetTimeline,
} from '../../src/lib/animations/detail-panel';

describe('createSideDetailPanelTimeline', () => {
  it('returns a paused timeline for open', () => {
    const panel = document.createElement('div');
    const tl = createSideDetailPanelTimeline(panel, 'open');
    expect(tl.paused()).toBe(true);
  });

  it('has one tween for open and one for close', () => {
    const panel = document.createElement('div');
    const open = createSideDetailPanelTimeline(panel, 'open');
    const close = createSideDetailPanelTimeline(panel, 'close');
    expect(open.getChildren(false, true, false).length).toBe(1);
    expect(close.getChildren(false, true, false).length).toBe(1);
  });

  it('does not throw on empty panel', () => {
    expect(() =>
      createSideDetailPanelTimeline(document.createElement('div'), 'open'),
    ).not.toThrow();
  });
});

describe('createBottomSheetTimeline', () => {
  it('returns a paused timeline for open', () => {
    const sheet = document.createElement('div');
    const tl = createBottomSheetTimeline(sheet, 'open');
    expect(tl.paused()).toBe(true);
  });

  it('has one tween for open and one for close', () => {
    const sheet = document.createElement('div');
    const open = createBottomSheetTimeline(sheet, 'open');
    const close = createBottomSheetTimeline(sheet, 'close');
    expect(open.getChildren(false, true, false).length).toBe(1);
    expect(close.getChildren(false, true, false).length).toBe(1);
  });

  it('does not throw on empty sheet', () => {
    expect(() =>
      createBottomSheetTimeline(document.createElement('div'), 'open'),
    ).not.toThrow();
  });
});
