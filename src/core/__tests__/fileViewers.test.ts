/**
 * One router for every surface -- docs/file-preview.md.
 *
 * The file browser already opened any text file in a coloured editor while a chat bubble offered
 * a download card for the same bytes, because two lists answered "what is this file". `viewerFor`
 * now reads the server's `kind` when there is one, the name otherwise, and the coarse `type` last.
 */
import { viewerFor, withView } from '../utils';
import { kindForName } from '../fileKind';

describe('viewerFor', () => {
  it('opens readable files in the reader, whatever their dialect', () => {
    expect(viewerFor('file', 'notes.md')).toBe('text');
    expect(viewerFor('file', 'notes.txt')).toBe('text');
    expect(viewerFor('file', 'main.py')).toBe('code');
    expect(viewerFor('file', 'data.json')).toBe('code');
    expect(viewerFor('file', 'rows.csv')).toBe('code');
    expect(viewerFor('file', 'page.html')).toBe('html');
    expect(viewerFor('file', 'config.yaml')).toBe('code');
    expect(viewerFor('file', 'Dockerfile')).toBe('code');
    expect(viewerFor('file', 'script.sh')).toBe('code');
    expect(viewerFor('file', 'query.sql')).toBe('code');
  });

  it('draws a picture, a film, a sound, a drawing and a PDF with their own viewers', () => {
    expect(viewerFor('image', 'shot.png')).toBe('image');
    expect(viewerFor('video', 'clip.mp4')).toBe('video');
    expect(viewerFor('audio', 'voice.m4a')).toBe('audio');
    expect(viewerFor('file', 'logo.svg')).toBe('svg');
    expect(viewerFor('file', 'report.pdf')).toBe('pdf');
    expect(viewerFor('file', 'capture', 'pdf')).toBe('pdf');
    expect(viewerFor('file', 'index.html')).toBe('html');
  });

  it('reads a document as its text and an archive as its entry list', () => {
    expect(viewerFor('file', 'report.docx')).toBe('office');
    expect(viewerFor('file', 'budget.xlsx')).toBe('office');
    expect(viewerFor('file', 'bundle.zip')).toBe('archive');
    expect(viewerFor('file', 'bundle.tar.gz')).toBe('archive');
  });

  it('leaves what cannot be shown to the download card', () => {
    expect(viewerFor('file', 'blob.bin')).toBeNull();
    expect(viewerFor('file', 'weird.qqq')).toBeNull();
  });

  it('trusts the server verdict over the name, both ways', () => {
    // The name says nothing the app knows; the server read the bytes.
    expect(viewerFor('file', 'capture', 'image')).toBe('image');
    // The name lies and the server knows better.
    expect(viewerFor('file', 'notes.md', 'code')).toBe('code');
    expect(viewerFor('file', 'notes.png', 'text')).toBe('text');
  });

  it('falls back to the coarse type when no name and no kind are known', () => {
    expect(viewerFor('image', 'blob')).toBe('image');
    expect(viewerFor('video', 'blob')).toBe('video');
    expect(viewerFor('audio', 'blob')).toBe('audio');
    expect(viewerFor('file', 'blob')).toBeNull();
    // A name with no extension but a known type is what the old rule already answered.
    expect(viewerFor('file', 'x.txt')).toBe('text');
    expect(viewerFor('file', 'x.md')).toBe('text');
  });
});

describe('withView', () => {
  it('asks a media url for a rendering of it, keeping whatever query it already carries', () => {
    expect(withView('http://host:8080/media/abc', 'text')).toBe('http://host:8080/media/abc?view=text');
    expect(withView('http://host:8080/media/abc?device=p&token=t', 'list')).toBe(
      'http://host:8080/media/abc?device=p&token=t&view=list',
    );
  });
});

describe('kindForName', () => {
  it('reads the extension, and a name that carries its language', () => {
    expect(kindForName('main.ts')).toBe('code');
    expect(kindForName('Makefile')).toBe('code');
    expect(kindForName('a/b/c.TXT')).toBe('text');
    expect(kindForName('report.pdf')).toBe('pdf');
    expect(kindForName('icon.svg')).toBe('svg');
    expect(kindForName('sheet.xlsx')).toBe('office');
  });

  it('says nothing when the name settles nothing', () => {
    expect(kindForName('capture')).toBeUndefined();
    expect(kindForName('weird.qqq')).toBeUndefined();
    expect(kindForName(undefined)).toBeUndefined();
  });
});
