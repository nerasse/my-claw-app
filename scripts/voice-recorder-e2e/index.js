import React, { useState } from 'react';
import { AppRegistry, View, Text } from 'react-native';
import { Composer } from '../../src/components/Composer';
import { deviceBridge } from '../../src/core/nativeBridge.web';
import { ThemeProvider } from '../../src/theme/ThemeProvider';

window.voiceTest = { starts: 0, stops: 0, cancels: 0, takes: [], errors: [], events: [], delay: 0 };
for (const [method, counter] of [['startRecording', 'starts'], ['stopRecording', 'stops'], ['cancelRecording', 'cancels']]) {
  const original = deviceBridge[method];
  deviceBridge[method] = (...args) => {
    window.voiceTest[counter]++;
    return original(...args);
  };
}
for (const type of ['touchstart', 'touchmove', 'touchend', 'touchcancel', 'contextmenu']) {
  document.addEventListener(type, event => window.voiceTest.events.push({ type, trusted: event.isTrusted }), true);
}

function Test() {
  const [text, setText] = useState('');
  const [takes, setTakes] = useState([]);
  const [error, setError] = useState('');
  return (
    <ThemeProvider>
      <View style={{ flex: 1, padding: 12, justifyContent: 'flex-end' }}>
        <Text accessibilityLabel="Test results">Saved: {takes.length} | {error}</Text>
        <Composer
          value={text} onChange={setText} onSend={() => {}} onPickAttachment={() => {}}
          onRecorded={take => {
            window.voiceTest.takes.push(take);
            setTakes(previous => [...previous, take]);
          }}
          onRecordingError={message => {
            window.voiceTest.errors.push(message);
            setError(message);
          }}
        />
      </View>
    </ThemeProvider>
  );
}
AppRegistry.registerComponent('VoiceTest', () => Test);
AppRegistry.runApplication('VoiceTest', { rootTag: document.getElementById('root') });
