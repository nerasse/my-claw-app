/**
 * The owner's fingers on a live page: a tap clicks where it lands, zoomed or not, and a finger's
 * drag scrolls the page with it. Driven through the gesture handlers themselves.
 */
import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import { View } from 'react-native';
import { GestureHandlerRootView, State } from 'react-native-gesture-handler';
import { fireGestureHandler, getByGestureTestId } from 'react-native-gesture-handler/jest-utils';
import { LiveSurface } from '../browser/LiveSurface';
import type { BrowserInput } from '../../core/protocol';

const frame = { uri: 'data:image/jpeg;base64,AA', seq: 1, width: 1600, height: 900 };

function mount(interactive = true, maxHeight?: number): { inputs: BrowserInput[]; tree: ReactTestRenderer.ReactTestRenderer } {
  const inputs: BrowserInput[] = [];
  let tree!: ReactTestRenderer.ReactTestRenderer;
  ReactTestRenderer.act(() => {
    tree = ReactTestRenderer.create(
      <GestureHandlerRootView>
        <LiveSurface frame={frame} interactive={interactive} onInput={i => inputs.push(i)} maxHeight={maxHeight} />
      </GestureHandlerRootView>,
    );
  });
  // The surface is sized by its layout: 400 wide, so the 1600x900 page draws 400x225.
  const wrap = tree.root.findAll(n => n.type === View && typeof n.props.onLayout === 'function')[0]!;
  ReactTestRenderer.act(() => wrap.props.onLayout({ nativeEvent: { layout: { x: 0, y: 0, width: 400, height: 225 } } }));
  return { inputs, tree };
}

describe('LiveSurface (touch)', () => {
  it('a tap clicks the page where the finger landed', () => {
    const { inputs, tree } = mount();
    ReactTestRenderer.act(() => {
      fireGestureHandler(getByGestureTestId('liveTap'), [
        { state: State.BEGAN, x: 100, y: 56.25 },
        { state: State.ACTIVE, x: 100, y: 56.25 },
        { state: State.END, x: 100, y: 56.25 },
      ]);
    });
    expect(inputs).toEqual([{ kind: 'tap', x: 0.25, y: 0.25 }]);
    ReactTestRenderer.act(() => tree.unmount());
  });

  it('a finger dragged up scrolls the page down, by the page pixels it crossed', () => {
    const { inputs, tree } = mount();
    ReactTestRenderer.act(() => {
      fireGestureHandler(getByGestureTestId('liveScroll'), [
        { state: State.BEGAN, x: 200, y: 150, translationX: 0, translationY: 0 },
        { state: State.ACTIVE, x: 200, y: 150, translationX: 0, translationY: 0 },
        { state: State.ACTIVE, x: 200, y: 100, translationX: 0, translationY: -50 },
        { state: State.END, x: 200, y: 100, translationX: 0, translationY: -50 },
      ]);
    });
    const wheels = inputs.filter(i => i.kind === 'wheel');
    expect(wheels).toHaveLength(1);
    expect(wheels[0]).toMatchObject({ kind: 'wheel', dy: 200 });
    ReactTestRenderer.act(() => tree.unmount());
  });

  // The keyboard came up: the picture fits the room left, 200x112.5 in a 400 wide pane, and a tap
  // is placed on that smaller picture.
  it('a picture fitted to a shorter room still clicks where the finger landed', () => {
    const { inputs, tree } = mount(true, 112.5);
    ReactTestRenderer.act(() => {
      fireGestureHandler(getByGestureTestId('liveTap'), [
        { state: State.BEGAN, x: 100, y: 56.25 },
        { state: State.ACTIVE, x: 100, y: 56.25 },
        { state: State.END, x: 100, y: 56.25 },
      ]);
    });
    expect(inputs).toEqual([{ kind: 'tap', x: 0.5, y: 0.5 }]);
    ReactTestRenderer.act(() => tree.unmount());
  });

  it('a page that takes no input gets none', () => {
    const { inputs, tree } = mount(false);
    ReactTestRenderer.act(() => {
      fireGestureHandler(getByGestureTestId('liveTap'), [
        { state: State.BEGAN, x: 100, y: 50 },
        { state: State.ACTIVE, x: 100, y: 50 },
        { state: State.END, x: 100, y: 50 },
      ]);
    });
    expect(inputs).toEqual([]);
    ReactTestRenderer.act(() => tree.unmount());
  });
});
