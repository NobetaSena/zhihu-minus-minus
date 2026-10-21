import { execFileSync } from 'node:child_process';
import { redirectSystemPath } from '../src/app/+native-intent';
import {
  getSafeExternalUrl,
  parseRichContentDevelopmentUrl,
  parseZhihuUrl,
  sanitizeNavigationUrlForLog,
} from '../src/utils/url';

test('the decoder backport preserves CommonJS queries and bounds malformed input work', () => {
  const output = execFileSync(
    process.execPath,
    [
      '-e',
      String.raw`
        const assert = require('node:assert/strict');
        const decode = require('decode-uri-component');
        const queryString = require('query-string');
        assert.equal(typeof decode, 'function');
        assert.equal(decode('a+b%2Bc'), 'a b+c');
        assert.equal(decode('%FE%FF%C2'), '\uFFFD\uFFFD\uFFFD');
        assert.equal(decode('中文%F0%9F%98%80%EA'), '中文😀%EA');
        assert.throws(() => decode(null), TypeError);
        assert.deepEqual(
          { ...queryString.parse('value=a+b%2Bc&unicode=%E4%B8%AD%E6%96%87') },
          { value: 'a b+c', unicode: '中文' },
        );
        assert.equal(queryString.stringify({ value: 'a b+c' }), 'value=a%20b%2Bc');
        const malformed = '%EA'.repeat(2048);
        assert.equal(decode(malformed + '%E4%B8%AD'), malformed + '中');
        assert.equal(queryString.parse('value=' + malformed).value, malformed);
        process.stdout.write('ok');
      `,
    ],
    { cwd: process.cwd(), encoding: 'utf8', timeout: 3000 },
  );
  expect(output).toBe('ok');
});

test('login navigation logs omit credentials, query and fragment', () => {
  expect(
    sanitizeNavigationUrlForLog(
      'https://user:password@www.zhihu.com/signin?ticket=synthetic#token=synthetic',
    ),
  ).toBe('https://www.zhihu.com/signin');
  expect(sanitizeNavigationUrlForLog('broken#token=synthetic')).toBe(
    '[invalid-url]',
  );
  expect(sanitizeNavigationUrlForLog('zhihu://signin#token=synthetic')).toBe(
    '[non-web-url]',
  );
});

test.each([
  ['https://example.com/article?q=1', 'https://example.com/article?q=1'],
  ['http://example.com', 'http://example.com/'],
  ['javascript:alert(1)', null],
  ['file:///private/synthetic', null],
  ['intent://synthetic#Intent;end', null],
  ['https://user:password@example.com', null],
])('restricts external content links to web URLs (%s)', (input, expected) => {
  expect(getSafeExternalUrl(input)).toBe(expected);
});

test.each([
  ['https://www.zhihu.com/question/42/answer/84?source=test', '/answer/84'],
  ['https://zhuanlan.zhihu.com/p/42#paragraph', '/article/42'],
  ['zhihu://question/42', '/question/42'],
  ['zhihu--:///people/synthetic/followers', '/user/synthetic/followers'],
  ['https://www.zhihu.com.evil.example/question/42', null],
  ['https://example.com/question/42', null],
  ['javascript://question/42', null],
])('normalizes supported links (%s)', (input, expected) => {
  expect(parseZhihuUrl(input)).toBe(expected);
});

test.each([
  ['https://www.zhihu.com/video/42', '/video/42?source=lens'],
  ['https://www.zhihu.com/zvideo/84', '/video/84?source=zvideo'],
  ['zhihu://video/42', '/video/42?source=lens'],
  ['zhihu://zvideo/84', '/video/84?source=zvideo'],
  ['zhihu--:///video/84', '/video/84?source=zvideo'],
  ['/video/84', '/video/84?source=zvideo'],
  ['zhihu--:///video/42?source=lens&ignored=1', '/video/42?source=lens'],
  [
    'zhihu--:///video/84?source=zvideo&title=%E8%A7%86%E9%A2%91',
    '/video/84?source=zvideo&title=%E8%A7%86%E9%A2%91',
  ],
])('keeps Lens and zvideo identities separate (%s)', (input, expected) => {
  expect(parseZhihuUrl(input)).toBe(expected);
  expect(redirectSystemPath({ path: input, initial: true })).toBe(expected);
  expect(redirectSystemPath({ path: input, initial: false })).toBe(expected);
});

test('direct playback routes retain only safe media resources', () => {
  const media = 'https://example.invalid/video.mp4?version=synthetic';
  const path = `/video/direct?source=direct&uri=${encodeURIComponent(media)}`;
  expect(parseZhihuUrl(`zhihu--://${path}&ignored=1`)).toBe(path);
  expect(parseZhihuUrl(path)).toBe(path);
  expect(
    parseZhihuUrl(
      'zhihu--:///video/direct?source=direct&uri=file%3A%2F%2F%2Fprivate%2Fvideo.mp4',
    ),
  ).toBeNull();
  expect(
    parseZhihuUrl(
      'zhihu--:///video/direct?source=direct&uri=https%3A%2F%2Fexample.invalid%2Fpage',
    ),
  ).toBeNull();
  expect(parseZhihuUrl(`https://www.zhihu.com${path}`)).toBeNull();
});

test('only the dev parser accepts the isolated native validation route', () => {
  expect(
    parseRichContentDevelopmentUrl(
      'zhihu--:///dev/native-validation?ignored=1',
    ),
  ).toBe('/dev/native-validation');
  expect(parseZhihuUrl('zhihu--:///dev/native-validation')).toBeNull();
  expect(
    parseRichContentDevelopmentUrl('https://example.com/dev/native-validation'),
  ).toBeNull();
});
