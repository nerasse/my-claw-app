import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import { Text } from 'react-native';
import { ThemeContext } from '../../theme';
import { darkPalette } from '../../theme/palettes';
import { DaySeparator } from '../DaySeparator';

function mount(day: number): ReactTestRenderer.ReactTestRenderer {
  let tree!: ReactTestRenderer.ReactTestRenderer;
  ReactTestRenderer.act(() => {
    tree = ReactTestRenderer.create(
      <ThemeContext.Provider value={{ palette: darkPalette, dark: true, mode: 'dark', themeId: 'sable' }}>
        <DaySeparator day={day} />
      </ThemeContext.Provider>,
    );
  });
  return tree;
}

function texts(tree: ReactTestRenderer.ReactTestRenderer): string {
  const collect = (value: unknown): string =>
    typeof value === 'string' || typeof value === 'number'
      ? String(value)
      : Array.isArray(value)
        ? value.map(collect).join('')
        : '';
  return tree.root.findAll(n => n.type === Text).map(n => collect(n.props.children)).join(' | ');
}

test('the divider names the day it opens', () => {
  const today = new Date();
  const day = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  const tree = mount(day);
  expect(texts(tree)).toBe('Today');
});

test('a day that is neither today nor yesterday is a date', () => {
  const tree = mount(new Date(2024, 0, 2).getTime());
  const shown = texts(tree);
  expect(shown).not.toBe('Today');
  expect(shown).not.toBe('Yesterday');
  expect(shown).toContain('2024');
});
