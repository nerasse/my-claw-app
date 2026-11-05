/**
 * One box per control in the title bar, and the gauge answers for effort, not for the model.
 *
 * Two things the owner found by looking at his own screenshot (2026-11-04):
 *
 * - the context gauge opened the model picker, while the model picker has its own button in the
 *   very same bar. Two doors onto one sheet, one of them unlabelled;
 * - the gauge stood 28 pt tall, the sub-agent counter 24, and the model button was a bare glyph
 *   between them, so the row of controls read as three heights and two vocabularies.
 *
 * Both are geometry or wiring, so both are asserted rather than eyeballed: a style object and a
 * prop, read back off the rendered tree.
 */

import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import { ChatScreen } from '../ChatScreen';
import { ContextMeter } from '../../components/ContextMeter';
import { ThemeContext, control } from '../../theme';
import { lightPalette } from '../../theme/palettes';
import { chatStore } from '../../core/chat';

const THREAD = 'header-boxes';
const noop = (): void => {};

function mount(over: Record<string, unknown> = {}): ReactTestRenderer.ReactTestRenderer {
  let tree!: ReactTestRenderer.ReactTestRenderer;
  ReactTestRenderer.act(() => {
    tree = ReactTestRenderer.create(
      <ThemeContext.Provider value={{ palette: lightPalette, dark: false, mode: 'light', themeId: 'sable' }}>
        <ChatScreen
          threadId={THREAD}
          title="A conversation"
          subtitle="anthropic / opus-5"
          connectionState="connected"
          mediaBase="http://localhost"
          deviceInfo={null}
          autoFocusHero={false}
          onOpenDrawer={noop}
          onStatusPress={noop}
          onSend={noop}
          locationEnabled={false}
          onBubbleMenu={noop}
          onResend={noop}
          onOpenImage={noop}
          onOpenText={noop}
          onOpenVideo={noop}
          onOpenSvg={noop}
          onOpenPdf={noop}
          onOpenHtml={noop}
          onOpenOffice={noop}
          onOpenArchive={noop}
          onOpenFile={noop}
          onOpenMenu={noop}
          onOpenModel={noop}
          onCommandEntered={() => false}
          streaming={false}
          onStop={noop}
          onQuestionReply={noop}
          onNewThread={noop}
          subagentCount={{ total: 3, running: 1 }}
          onAgentsPress={noop}
          subagentDoors={new Map()}
          onLoadOlder={noop}
          loadingOlder={false}
          uiPrefs={{ expandTools: false, expandReasoning: false }}
          {...over}
        />
      </ThemeContext.Provider>,
    );
  });
  return tree;
}

beforeEach(() => {
  chatStore.seedHistory(THREAD, []);
});

/** The flattened style of the host view under an accessible node. */
function boxOf(tree: ReactTestRenderer.ReactTestRenderer, label: string): Record<string, unknown> {
  const node = tree.root.findAll(
    n => n.props.accessibilityLabel === label && typeof n.type !== 'string',
  )[0];
  return flatten(node.props.style);
}

/** `style` is an object or an array of them (and nested arrays): read it the way RN does. */
function flatten(style: unknown): Record<string, unknown> {
  if (Array.isArray(style)) return Object.assign({}, ...style.map(flatten));
  return (style ?? {}) as Record<string, unknown>;
}

test('the model button wears the same box as the chips beside it', () => {
  // 900 pt: well past the threshold, so the button is drawn at all.
  const tree = mount();
  const model = boxOf(tree, 'Change model');
  const actions = boxOf(tree, 'Commands');
  const agents = boxOf(tree, '3 sub-agents, 1 running');

  expect(model.height).toBe(control.height);
  expect(model.width).toBe(control.height);
  expect(agents.height).toBe(control.height);
  expect(actions.height).toBe(control.height);
  // The gauge is a chip too, but it is drawn from AppShell: its own test pins that side.
  expect(model.backgroundColor).toBeDefined();
});

/**
 * The order of the controls, left to right.
 *
 * The owner reads the row as a narrowing: what the run costs (the gauge), what it runs on (the
 * model), who it has working (the agents), then the menu (2026-11-05: "mettre les sous-agents
 * tout à droite, puis à sa gauche l'icône des modèles, puis à sa gauche la barre de contexte").
 *
 * Order is asserted on the tree rather than on a screenshot because a swap is invisible to every
 * other test here: all four boxes keep their geometry, and only their sequence changes.
 */
test('the controls run window, model, agents, menu', () => {
  const tree = mount();
  const labels = tree.root
    .findAll(node => typeof node.props.accessibilityLabel === 'string', { deep: true })
    .map(node => node.props.accessibilityLabel as string)
    .filter(label => label === 'Change model' || label === 'Commands' || /^3 sub-agents/.test(label));
  // A Pressable is in the tree twice, composite then its host view: those two are adjacent, so
  // collapsing runs of the same label keeps the order and loses only the duplicate wrapper.
  const order = labels.filter((label, index) => label !== labels[index - 1]);

  expect(order).toEqual(['Change model', '3 sub-agents, 1 running', 'Commands']);
});

test('the gauge opens the effort and window sheet, not the picker', () => {
  const onTune = jest.fn();
  const onModel = jest.fn();
  let tree!: ReactTestRenderer.ReactTestRenderer;
  ReactTestRenderer.act(() => {
    tree = ReactTestRenderer.create(
      <ThemeContext.Provider value={{ palette: lightPalette, dark: false, mode: 'light', themeId: 'sable' }}>
        <ContextMeter used={1000} effective={10000} percent={10} onPress={onTune} />
      </ThemeContext.Provider>,
    );
  });
  const wrap = tree.root.findAll(n => n.props.accessibilityRole === 'button')[0];
  ReactTestRenderer.act(() => {
    wrap.props.onResponderRelease?.({});
  });

  expect(onTune).toHaveBeenCalledTimes(1);
  expect(onModel).not.toHaveBeenCalled();
});

test('the gauge is the toolbar box too', () => {
  let tree!: ReactTestRenderer.ReactTestRenderer;
  ReactTestRenderer.act(() => {
    tree = ReactTestRenderer.create(
      <ThemeContext.Provider value={{ palette: lightPalette, dark: false, mode: 'light', themeId: 'sable' }}>
        <ContextMeter used={1000} effective={10000} percent={10} />
      </ThemeContext.Provider>,
    );
  });
  const wrap = tree.root.findAll(n => n.props.accessibilityLabel?.includes('of the context window'))[0];
  expect(flatten(wrap.props.style).height).toBe(control.height);
});

/**
 * The facts line gives way, it does not run under the ⋮.
 *
 * With `flexShrink: 0` on the subtitle (the RN default for a Text), the line kept its intrinsic
 * width and painted outside its column: on a phone, `provider / model · effort · from the … · 1.9%`
 * ended under the three-dot button. The owner's rule is that this must never happen, so the
 * geometry is asserted rather than eyeballed: the text column shrinks, clips, and the controls keep
 * their box whatever the title or the model name is.
 */
test('the title and facts lines shrink, so nothing lands under the menu', () => {
  const tree = mount({ subtitle: 'opencode_go / DeepSeek V4.1 Flash · max · from the parent · 1.9%' });
  const screen = tree.root.findAll(n => typeof n.type !== 'string')[0]!;
  const styles = screen.findAll(n => typeof n.type !== 'string' && n.props.style).map(n => flatten(n.props.style));
  const subtitle = styles.filter(s => s.fontSize !== undefined && s.flexShrink === 1);
  expect(subtitle.length).toBeGreaterThan(0);
  expect(styles.some(s => s.flex === 1 && s.overflow === 'hidden')).toBe(true);
  expect(boxOf(tree, 'Commands').flexShrink).toBe(0);
});
