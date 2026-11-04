import { spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';
import { writeFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { expect, test } from 'vitest';
import { countWords, maximumWords } from '../../scripts/code-map-check.mjs';
import { stageNames } from '../../scripts/verify.mjs';
import { cleanup, temporaryDirectory } from '../support/workspace.js';

const runner = pathToFileURL(resolve('scripts/verify.mjs')).href;
const checker = resolve('scripts/code-map-check.mjs');
const child = (name: string, code: string) => ({
  name,
  command: process.execPath,
  args: ['-e', code],
});
const source = (stages: ReturnType<typeof child>[]) =>
  `import {runStages} from ${JSON.stringify(runner)}; process.exitCode = await runStages(${JSON.stringify(stages)});`;

test('map budget counts Unicode source tokens consistently and rejects oversize/unreadable inputs', () => {
  const root = temporaryDirectory();
  try {
    const file = join(root, 'map.md');
    expect(countWords('| Žluťoučký | 字 | 42 |\n| --- | :---: | --- |')).toBe(
      3,
    );
    expect(countWords('| Žluťoučký    |\r\n 字 |\r\n42 |')).toBe(3);
    for (const size of [maximumWords - 1, maximumWords, maximumWords + 1]) {
      writeFileSync(file, 'word\n'.repeat(size));
      const result = spawnSync(process.execPath, [checker, file], {
        encoding: 'utf8',
      });
      expect(result.status).toBe(size > maximumWords ? 1 : 0);
      expect(result.stdout).toContain(`${size} words; ceiling=${maximumWords}`);
      if (size > maximumWords)
        expect(result.stderr).toContain('Preserve useful navigation');
    }
    for (const unreadable of [join(root, 'missing.md'), root]) {
      const result = spawnSync(process.execPath, [checker, unreadable], {
        encoding: 'utf8',
      });
      expect(result.status).toBe(1);
      expect(result.stderr).toContain('cannot read input');
    }
  } finally {
    cleanup(root);
  }
});

test('real child stages report success, fail fast, and propagate map gate and launch failures', () => {
  expect(stageNames).toEqual([
    'typecheck',
    'lint',
    'format:check',
    'code-map:check',
    'architecture:check',
    'build',
    'test',
    'test:integration',
    'test:acceptance',
    'test:cli',
    'test:browser',
  ]);
  const root = temporaryDirectory();
  try {
    const marker = join(root, 'later');
    const later = child(
      'later',
      `require('node:fs').writeFileSync(${JSON.stringify(marker)}, '')`,
    );
    const map = join(root, 'oversize.md');
    writeFileSync(map, 'word '.repeat(maximumWords + 1));
    for (const failing of [
      child('failure', 'process.exit(7)'),
      { name: 'map', command: process.execPath, args: [checker, map] },
      { name: 'launch', command: join(root, 'missing-executable'), args: [] },
    ]) {
      const result = spawnSync(
        process.execPath,
        ['--input-type=module', '-e', source([failing, later])],
        { encoding: 'utf8' },
      );
      expect(result.status).toBe(failing.name === 'failure' ? 7 : 1);
      expect(result.stdout).toContain(`FAIL ${failing.name}`);
      expect(result.stdout).not.toContain('START later');
      expect(existsSync(marker)).toBe(false);
    }
    const success = spawnSync(
      process.execPath,
      ['--input-type=module', '-e', source([child('first', ''), later])],
      { encoding: 'utf8' },
    );
    expect(success.status).toBe(0);
    expect(success.stdout).toMatch(/PASS first [\d.]+s exit=0/);
    expect(success.stdout).toMatch(/TOTAL [\d.]+s exit=0/);
    expect(existsSync(marker)).toBe(true);
  } finally {
    cleanup(root);
  }
});

test.each(['SIGINT', 'SIGTERM'] as const)(
  '%s fails the aggregate, stops later stages and terminates descendants',
  async (signal) => {
    const code = `const {spawn}=require('node:child_process'); const child=spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{stdio:'ignore'}); console.log('DESCENDANT='+child.pid); setInterval(()=>{},1000);`;
    const processUnderTest = spawn(
      process.execPath,
      [
        '--input-type=module',
        '-e',
        `if (process.platform === 'win32') process.on('message', () => { process.emit('${signal}'); process.disconnect(); });` +
          source([child('long', code), child('later', '')]),
      ],
      {
        stdio:
          process.platform === 'win32'
            ? ['ignore', 'pipe', 'pipe', 'ipc']
            : ['ignore', 'pipe', 'pipe'],
      },
    );
    let output = '';
    processUnderTest.stdout?.on('data', (chunk: Buffer) => {
      output += chunk.toString();
    });
    try {
      await expect.poll(() => output).toMatch(/DESCENDANT=\d+/);
      const pid = Number(/DESCENDANT=(\d+)/.exec(output)?.[1]);
      // Windows kill() terminates instead of delivering SIGTERM. Use a real IPC
      // message to request emission of the same handler event on that platform.
      if (process.platform === 'win32') processUnderTest.send('interrupt');
      else processUnderTest.kill(signal);
      await once(processUnderTest, 'close');
      {
        expect(processUnderTest.exitCode).toBe(signal === 'SIGINT' ? 130 : 143);
        expect(output).toContain('FAIL long');
        expect(() => process.kill(pid, 0)).toThrow();
      }
      expect(output).not.toContain('START later');
    } finally {
      processUnderTest.kill();
    }
  },
);
