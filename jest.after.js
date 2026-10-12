/**
 * State that outlives a render tree.
 *
 * A module-level store is shared by every test in the process, so a case inherits whatever the
 * previous one left behind. Resetting it per file only protects the files that remember to,
 * which is how a staged voice note from one test made the microphone disappear in the next.
 */
const { clearAllDrafts } = require('./src/core/drafts');
const { act } = require('react-test-renderer');

beforeEach(() => {
  clearAllDrafts();
});

afterEach(async () => {
  // Load after the suite's connection mocks, rather than caching the real connection before them.
  const { chatStore } = require('./src/core/chat');
  await act(async () => chatStore.clearAll());
});
