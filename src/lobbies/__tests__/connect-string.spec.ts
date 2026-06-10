import { buildConnectString } from '../connect-string';

describe('buildConnectString', () => {
  it('formats without a password', () => {
    expect(
      buildConnectString({ host: '203.0.113.10', port: 27015 }),
    ).toBe('connect 203.0.113.10:27015');
  });

  it('prefixes password when provided', () => {
    expect(
      buildConnectString({
        host: 'cs2.example.com',
        port: 27016,
        password: 'play123',
      }),
    ).toBe('password play123; connect cs2.example.com:27016');
  });

  it('trims whitespace-only passwords to empty', () => {
    expect(
      buildConnectString({
        host: 'cs2.example.com',
        port: 27016,
        password: '   ',
      }),
    ).toBe('connect cs2.example.com:27016');
  });

  it('treats null password as no password', () => {
    expect(
      buildConnectString({
        host: '10.0.0.1',
        port: 27015,
        password: null,
      }),
    ).toBe('connect 10.0.0.1:27015');
  });
});
