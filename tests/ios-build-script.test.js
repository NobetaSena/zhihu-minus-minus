const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

describe('unsigned iOS build script', () => {
  let directory;
  let binDirectory;

  beforeEach(() => {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), 'zhihu-ipa-test-'));
    binDirectory = path.join(directory, 'bin');
    fs.mkdirSync(binDirectory);
    fs.mkdirSync(path.join(directory, 'ios', 'ReviewFixture.xcworkspace'), {
      recursive: true,
    });
    fs.mkdirSync(path.join(directory, 'scripts'));
    fs.copyFileSync(
      path.join(__dirname, '..', 'scripts', 'build-unsigned-ipa.sh'),
      path.join(directory, 'scripts', 'build-unsigned-ipa.sh'),
    );
    fs.writeFileSync(
      path.join(directory, 'package.json'),
      '{"version":"1.2.3"}',
    );
    for (const [name, body] of Object.entries({
      npx: 'echo "prebuild $*" >> "$IPA_TEST_TRACE"',
      pod: `echo "pods $*" >> "$IPA_TEST_TRACE"\nexit "\${IPA_TEST_POD_EXIT:-0}"`,
      xcodebuild: `echo "xcode $*" >> "$IPA_TEST_TRACE"
mkdir -p build/Release-iphoneos/ReviewFixture.app
echo binary > build/Release-iphoneos/ReviewFixture.app/ReviewFixture
if [ "\${IPA_TEST_MULTIPLE_APPS:-0}" = 1 ]; then
  mkdir -p build/Release-iphoneos/Other.app
fi`,
    })) {
      const filename = path.join(binDirectory, name);
      fs.writeFileSync(filename, `#!/bin/bash\nset -eu\n${body}\n`, {
        mode: 0o755,
      });
    }
  });

  afterEach(() => {
    fs.rmSync(directory, { recursive: true, force: true });
  });

  function run(extraEnv = {}) {
    return spawnSync(
      'bash',
      [path.join(directory, 'scripts', 'build-unsigned-ipa.sh')],
      {
        cwd: binDirectory,
        encoding: 'utf8',
        env: {
          ...process.env,
          PATH: `${binDirectory}${path.delimiter}${process.env.PATH}`,
          IPA_TEST_TRACE: path.join(directory, 'trace.txt'),
          ...extraEnv,
        },
      },
    );
  }

  test('refreshes existing native code and preserves other artifacts and local Xcode settings', () => {
    const oldIpa = path.join(
      directory,
      'zhihu-minus-minus-v1.0.0-unsigned.ipa',
    );
    const localEnv = path.join(directory, 'ios', '.xcode.env.local');
    fs.writeFileSync(oldIpa, 'previous build');
    fs.writeFileSync(localEnv, '# user settings\n');
    fs.mkdirSync(path.join(directory, 'Payload'));
    fs.writeFileSync(path.join(directory, 'Payload', 'user-file'), 'keep');

    const result = run();
    expect(result.status).toBe(0);
    const trace = fs.readFileSync(path.join(directory, 'trace.txt'), 'utf8');
    expect(trace).toContain(
      'prebuild expo prebuild --platform ios --no-install',
    );
    expect(trace).toContain('pods install');
    expect(trace).toContain(
      '-workspace ios/ReviewFixture.xcworkspace -scheme ReviewFixture',
    );
    expect(fs.readFileSync(oldIpa, 'utf8')).toBe('previous build');
    expect(fs.readFileSync(localEnv, 'utf8')).toBe('# user settings\n');
    expect(fs.existsSync(path.join(directory, 'Payload', 'user-file'))).toBe(
      true,
    );
    const ipa = path.join(directory, 'zhihu-minus-minus-v1.2.3-unsigned.ipa');
    const entries = spawnSync('unzip', ['-Z1', ipa], { encoding: 'utf8' });
    expect(entries.status).toBe(0);
    expect(entries.stdout).toContain('Payload/ReviewFixture.app/ReviewFixture');
    expect(fs.readdirSync(path.join(directory, 'build'))).toEqual([
      'Release-iphoneos',
    ]);
  });

  test('stops before compiling when Pods installation fails', () => {
    expect(run({ IPA_TEST_POD_EXIT: '1' }).status).not.toBe(0);
    expect(
      fs.readFileSync(path.join(directory, 'trace.txt'), 'utf8'),
    ).not.toContain('xcode ');
  });

  test('rejects ambiguous workspaces or built apps', () => {
    fs.mkdirSync(path.join(directory, 'ios', 'Other.xcworkspace'));
    expect(run().status).not.toBe(0);
    fs.rmSync(path.join(directory, 'ios', 'Other.xcworkspace'), {
      recursive: true,
    });
    expect(run({ IPA_TEST_MULTIPLE_APPS: '1' }).status).not.toBe(0);
    expect(
      fs.existsSync(
        path.join(directory, 'zhihu-minus-minus-v1.2.3-unsigned.ipa'),
      ),
    ).toBe(false);
  });
});
