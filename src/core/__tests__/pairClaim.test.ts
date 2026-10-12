import { originFromPairingScan } from '../pairClaim';

test('a claim QR provides its server origin without the pairing fragment', () => {
  expect(originFromPairingScan('https://my.example/pair#K7QW3M2P')).toBe('https://my.example');
});
test('a bare code uses the manually selected server', () => {
  expect(originFromPairingScan('K7QW3M2P')).toBeNull();
});
test('a QR cannot introduce credentials in the server authority', () => {
  expect(originFromPairingScan('https://user:password@my.example/pair#K7QW3M2P')).toBeNull();
});
