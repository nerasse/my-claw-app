import {
  REVEAL_MARGIN,
  liftFor,
  measureOnScreen,
  probeText,
  revealFieldAboveKeyboard,
} from '../revealField';

/** A host that answers with a fixed rect, the way a laid-out `TextInput` would. */
const hostAt = (top: number, height: number) => {
  return { measureInWindow: (callback: (x: number, y: number, w: number, h: number) => void) => callback(0, top, 300, height) };
};

describe('the lift a covered field needs', () => {
  it('leaves a field that already clears the keyboard where it is', () => {
    // Bottom 800, keyboard starts at 900: nothing to do, and re-asserting the offset here is what
    // a keyboard re-announcement would otherwise turn into a walk up the thread.
    expect(liftFor(800, 900, 420)).toBe(420);
  });

  it('lifts by exactly what the keyboard covers, margin included', () => {
    // Field bottom 1000, keyboard top 900, and the margin has to be cleared too.
    expect(liftFor(1000, 900, 300)).toBe(300 - (1000 + REVEAL_MARGIN - 900));
  });

  it('never asks for an offset before the newest message', () => {
    // The whole reason this is a function and not an inline subtraction: the list is inverted, the
    // newest content is at offset 0, and a covered field there has nothing to scroll into.
    expect(liftFor(1000, 900, 50)).toBe(0);
  });

  it('treats a field flush against the keyboard as covered', () => {
    expect(liftFor(900, 900, 200, 0)).toBe(200);
    expect(liftFor(900, 900, 200)).toBe(200 - REVEAL_MARGIN);
  });

  it('is settled by its own result once the field is measured again', () => {
    // The second measurement is of a field that moved: this is why the reveal runs after the
    // keyboard rather than twice against the same numbers.
    expect(liftFor(1000, 900, 184)).toBe(68);
    expect(liftFor(884, 900, 184)).toBe(184);
  });
});

describe('measuring a field on screen', () => {
  it('reports the rect the host gives', async () => {
    await expect(measureOnScreen(hostAt(1200, 60))).resolves.toEqual({ top: 1200, bottom: 1260 });
  });

  it('answers null for a node that is not there', async () => {
    await expect(measureOnScreen(null)).resolves.toBeNull();
  });

  it('gives up on a node that never calls back, so the next reveal is not stuck behind it', async () => {
    jest.useFakeTimers();
    try {
      const pending = measureOnScreen({ measureInWindow: () => {} });
      jest.advanceTimersByTime(1000);
      await expect(pending).resolves.toBeNull();
    } finally {
      jest.useRealTimers();
    }
  });
});

describe('revealing a field above the keyboard', () => {
  it('scrolls to the lift and reports the numbers', async () => {
    const asked: number[] = [];
    const probe = await revealFieldAboveKeyboard({
      field: hostAt(1000, 60),
      metrics: { height: 700, screenY: 900 },
      offset: 300,
      scrollTo: offset => asked.push(offset),
    });
    expect(asked).toEqual([300 - (1060 + REVEAL_MARGIN - 900)]);
    expect(probe.field).toEqual({ top: 1000, bottom: 1060 });
    expect(probe.keyboardTop).toBe(900);
    expect(probe.keyboardHeight).toBe(700);
    expect(probe.offsetBefore).toBe(300);
    expect(probe.offsetAfter).toBe(asked[0]);
  });

  it('does not touch the list when the field is already clear', async () => {
    const asked: number[] = [];
    const probe = await revealFieldAboveKeyboard({
      field: hostAt(200, 60),
      metrics: { height: 700, screenY: 900 },
      offset: 0,
      scrollTo: offset => asked.push(offset),
    });
    expect(asked).toEqual([]);
    expect(probe.offsetAfter).toBe(0);
  });

  it('leaves the list alone, and says the keyboard is down, when there is no geometry', async () => {
    const asked: number[] = [];
    const probe = await revealFieldAboveKeyboard({
      field: hostAt(1000, 60),
      metrics: undefined,
      offset: 120,
      scrollTo: offset => asked.push(offset),
    });
    expect(asked).toEqual([]);
    expect(probe.keyboardTop).toBeNull();
    expect(probe.keyboardHeight).toBeNull();
    expect(probe.offsetAfter).toBe(120);
  });

  it('reports an unmeasurable field rather than lifting it on a guess', async () => {
    const asked: number[] = [];
    const probe = await revealFieldAboveKeyboard({
      field: null,
      metrics: { height: 700, screenY: 900 },
      offset: 120,
      scrollTo: offset => asked.push(offset),
    });
    expect(asked).toEqual([]);
    expect(probe.field).toBeNull();
    expect(probeText(probe)).toContain('field=unmeasured');
  });
});

describe('the line the report carries', () => {
  it('names the field, the keyboard and the move', () => {
    const line = probeText({
      field: { top: 1000, bottom: 1060 },
      keyboardTop: 900,
      keyboardHeight: 700,
      offsetBefore: 300,
      offsetAfter: 184,
    });
    expect(line).toBe(
      'question field reveal: field=1000..1060 keyboardTop=900 keyboardHeight=700 offset=300->184',
    );
  });

  it('says the keyboard is down rather than printing a zero', () => {
    const line = probeText({ field: null, keyboardTop: null, keyboardHeight: null, offsetBefore: 0, offsetAfter: 0 });
    expect(line).toContain('keyboardTop=down');
    expect(line).toContain('keyboardHeight=-');
  });
});
