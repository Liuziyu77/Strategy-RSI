import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import type { Page } from '@playwright/test';

// Capture lossless PNG frames before H.264 encoding. Playwright's recordVideo first
// compresses to VP8, which loses small Chinese glyphs before a later MP4 conversion.
export const startRecording = async (
  page: Page,
  scratch: string,
  name: string,
  viewport: { width: number; height: number },
) => {
  const folder = join(scratch, name);
  mkdirSync(folder);
  const session = await page.context().newCDPSession(page);
  const frames: { path: string; time: number }[] = [];
  session.on('Page.screencastFrame', (frame) => {
    const path = join(folder, `${String(frames.length).padStart(6, '0')}.png`);
    writeFileSync(path, Buffer.from(frame.data, 'base64'));
    frames.push({ path, time: frame.metadata.timestamp ?? Date.now() / 1000 });
    void session.send('Page.screencastFrameAck', { sessionId: frame.sessionId });
  });
  await session.send('Page.startScreencast', {
    format: 'png',
    maxWidth: viewport.width,
    maxHeight: viewport.height,
    everyNthFrame: 2,
  });
  return async () => {
    await session.send('Page.stopScreencast');
    await session.detach();
    if (frames.length < 2) throw new Error('Too few frames captured.');
    const list = join(folder, 'frames.ffconcat');
    writeFileSync(
      list,
      'ffconcat version 1.0\n' +
        frames
          .map((frame, i) => {
            const duration = Math.max(
              0.001,
              (frames[i + 1]?.time ?? frame.time + 0.5) - frame.time,
            );
            return `file '${frame.path}'\nduration ${duration.toFixed(6)}`;
          })
          .join('\n') +
        `\nfile '${frames.at(-1)!.path}'\n`,
    );
    console.log(`${name}: ${frames.length} lossless frames captured.`);
    return list;
  };
};

export const encodeRecording = (
  input: string,
  out: string,
  name: string,
  duration: number,
  previewDuration: number,
) => {
  const source = ['-f', 'concat', '-safe', '0', '-i', input];
  execFileSync('ffmpeg', [
    '-y',
    '-hide_banner',
    '-loglevel',
    'error',
    ...source,
    '-t',
    String(duration),
    '-vf',
    'fps=30',
    '-c:v',
    'libx264',
    '-crf',
    '16',
    '-preset',
    'slow',
    '-threads',
    '4',
    '-pix_fmt',
    'yuv420p',
    '-movflags',
    '+faststart',
    '-an',
    join(out, `${name}.mp4`),
  ]);
  execFileSync('ffmpeg', [
    '-y',
    '-hide_banner',
    '-loglevel',
    'error',
    ...source,
    '-t',
    String(previewDuration),
    '-vf',
    'fps=12,scale=1440:-2:flags=lanczos,split[a][b];[a]palettegen=max_colors=256:stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=4:diff_mode=rectangle',
    '-filter_complex_threads',
    '1',
    '-loop',
    '0',
    join(out, `${name}.gif`),
  ]);
};
