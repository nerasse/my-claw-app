/**
 * The bars over a full-screen picture, on a desktop.
 *
 * On web they used to vanish five seconds in and only a click brought them back, which on a
 * zoomable picture is also a zoom: the gesture that reveals the controls changed what you were
 * looking at. Every lightbox answers to a mouse move instead, and that is what the web build
 * hands the viewer now. On a phone there is no pointer to move -- the tap still flips the bars --
 * so the native build must hand over nothing at all, and no stray DOM prop may reach a View.
 */

const { pointerActivityProps, pointerHoverProps } = require('../webProps.web') as typeof import('../webProps.web');
const native = require('../webProps') as typeof import('../webProps');

interface PointerProps {
  onPointerMove?: () => void;
  onPointerEnter?: () => void;
  onPointerLeave?: () => void;
}

describe('the viewer wakes on the pointer, web only', () => {
  it('counts a mouse move on the surface as activity', () => {
    const activity = jest.fn();
    const props = pointerActivityProps(activity) as PointerProps;
    props.onPointerMove?.();
    props.onPointerMove?.();
    expect(activity).toHaveBeenCalledTimes(2);
  });

  it('counts the pointer arriving on the surface too', () => {
    const activity = jest.fn();
    const props = pointerActivityProps(activity) as PointerProps;
    props.onPointerEnter?.();
    expect(activity).toHaveBeenCalledTimes(1);
  });

  it('holds the bars while the pointer is on them, and lets go when it leaves', () => {
    const hover = jest.fn();
    const props = pointerHoverProps(hover) as PointerProps;
    props.onPointerEnter?.();
    props.onPointerLeave?.();
    expect(hover.mock.calls).toEqual([[true], [false]]);
  });

  it('hands nothing to the native build: a phone has no pointer', () => {
    expect(Object.keys(native.pointerActivityProps(() => {}))).toEqual([]);
    expect(Object.keys(native.pointerHoverProps(() => {}))).toEqual([]);
  });
});
