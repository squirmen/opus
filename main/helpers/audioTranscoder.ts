import { spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as electronLog from 'electron-log';

const logger = electronLog.default;

// Cache for transcoded files to avoid re-transcoding
const transcodedCache = new Map<string, string>();
const CACHE_DIR = path.join(require('electron').app.getPath('userData'), 'transcoded');

// Ensure cache directory exists
if (!fs.existsSync(CACHE_DIR)) {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
}

/**
 * Check if a file is ALAC encoded
 */
export async function isALACFile(filePath: string): Promise<boolean> {
  return new Promise((resolve) => {
    const ffprobe = spawn('ffprobe', [
      '-v', 'quiet',
      '-print_format', 'json',
      '-show_streams',
      filePath
    ]);

    let output = '';
    ffprobe.stdout.on('data', (data) => {
      output += data;
    });

    ffprobe.on('close', (code) => {
      if (code !== 0) {
        resolve(false);
        return;
      }

      try {
        const info = JSON.parse(output);
        const audioStream = info.streams?.find((s: any) => s.codec_type === 'audio');
        const isALAC = audioStream?.codec_name === 'alac';
        if (isALAC) {
          logger.info(`Detected ALAC codec in file: ${filePath}`);
        }
        resolve(isALAC);
      } catch (err) {
        logger.error('Error parsing ffprobe output:', err);
        resolve(false);
      }
    });

    ffprobe.on('error', (err) => {
      logger.error('ffprobe error:', err);
      resolve(false);
    });
  });
}

/**
 * Transcode ALAC file to FLAC format (lossless)
 */
export async function transcodeALACToFLAC(inputPath: string): Promise<string | null> {
  // Check cache first
  if (transcodedCache.has(inputPath)) {
    const cachedPath = transcodedCache.get(inputPath)!;
    if (fs.existsSync(cachedPath)) {
      logger.info(`Using cached transcoded file: ${cachedPath}`);
      return cachedPath;
    }
  }

  // Generate output filename
  const inputHash = require('crypto')
    .createHash('md5')
    .update(inputPath)
    .digest('hex');
  const outputPath = path.join(CACHE_DIR, `${inputHash}.flac`);

  // If already transcoded, return cached path
  if (fs.existsSync(outputPath)) {
    transcodedCache.set(inputPath, outputPath);
    logger.info(`Found existing transcoded file: ${outputPath}`);
    return outputPath;
  }

  logger.info(`Transcoding ALAC to FLAC (lossless): ${inputPath} -> ${outputPath}`);

  return new Promise((resolve) => {
    const ffmpeg = spawn('ffmpeg', [
      '-i', inputPath,
      '-c:a', 'flac', // FLAC codec (lossless)
      '-compression_level', '5', // Balanced compression (0-12, 5 is default)
      '-c:v', 'copy', // Copy video stream (preserves album art)
      outputPath,
      '-y' // Overwrite
    ]);

    let errorOutput = '';
    ffmpeg.stderr.on('data', (data) => {
      errorOutput += data.toString();
    });

    ffmpeg.on('close', (code) => {
      if (code !== 0) {
        logger.error(`FFmpeg failed with code ${code}: ${errorOutput}`);
        resolve(null);
        return;
      }

      if (fs.existsSync(outputPath)) {
        transcodedCache.set(inputPath, outputPath);
        logger.info(`Successfully transcoded to FLAC: ${outputPath}`);
        resolve(outputPath);
      } else {
        logger.error('Transcoded file not found after ffmpeg completed');
        resolve(null);
      }
    });

    ffmpeg.on('error', (err) => {
      logger.error('FFmpeg error:', err);
      resolve(null);
    });
  });
}

// Keep the old function name as alias for compatibility
export const transcodeALACToAAC = transcodeALACToFLAC;

/**
 * Clean up old transcoded files (call periodically)
 */
export function cleanupTranscodedCache(maxAgeMs: number = 7 * 24 * 60 * 60 * 1000) {
  try {
    const now = Date.now();
    const files = fs.readdirSync(CACHE_DIR);

    for (const file of files) {
      const filePath = path.join(CACHE_DIR, file);
      const stats = fs.statSync(filePath);

      if (now - stats.mtimeMs > maxAgeMs) {
        fs.unlinkSync(filePath);
        logger.info(`Cleaned up old transcoded file: ${filePath}`);
      }
    }
  } catch (err) {
    logger.error('Error cleaning up transcoded cache:', err);
  }
}

/**
 * Stream transcode for real-time playback (alternative approach)
 */
export function createTranscodeStream(inputPath: string) {
  const ffmpeg = spawn('ffmpeg', [
    '-i', inputPath,
    '-f', 'mp3', // Output format
    '-c:a', 'libmp3lame', // MP3 codec
    '-b:a', '256k',
    '-' // Output to stdout
  ]);

  return ffmpeg.stdout;
}