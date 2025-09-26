/**
 * Codec detection utilities for enhanced audio format support
 */

import { parseFile } from 'music-metadata';
import * as path from 'path';

export interface CodecInfo {
  container: string;
  codec: string;
  isLossless: boolean;
  isSupported: boolean;
  fallbackRequired: boolean;
}

/**
 * Detect the actual codec of an audio file
 * Particularly useful for M4A files which can contain AAC (lossy) or ALAC (lossless)
 */
export async function detectCodec(filePath: string): Promise<CodecInfo> {
  try {
    const metadata = await parseFile(filePath);
    const format = metadata.format;
    const ext = path.extname(filePath).toLowerCase();

    // Default response
    const codecInfo: CodecInfo = {
      container: ext.replace('.', ''),
      codec: format.codec || 'unknown',
      isLossless: format.lossless || false,
      isSupported: true,
      fallbackRequired: false
    };

    // Special handling for M4A files
    if (ext === '.m4a' || ext === '.m4b' || ext === '.mp4') {
      if (format.codec === 'ALAC' || format.codec === 'alac') {
        codecInfo.codec = 'ALAC';
        codecInfo.isLossless = true;
        // ALAC has limited browser support
        codecInfo.fallbackRequired = !isALACSupported();
      } else if (format.codec === 'AAC' || format.codec === 'mp4a' || format.codec?.includes('mp4a')) {
        codecInfo.codec = 'AAC';
        codecInfo.isLossless = false;
        codecInfo.isSupported = true;
      }
    }

    // Check for other lossless formats
    if (ext === '.flac') {
      codecInfo.isLossless = true;
    }

    return codecInfo;
  } catch (error) {
    // If detection fails, fall back to extension-based detection
    const ext = path.extname(filePath).toLowerCase().replace('.', '');
    return {
      container: ext,
      codec: ext,
      isLossless: ext === 'flac' || ext === 'wav',
      isSupported: isSupportedExtension(ext),
      fallbackRequired: false
    };
  }
}

/**
 * Check if ALAC is supported in the current environment
 * Electron/Chromium has better support than regular browsers
 */
function isALACSupported(): boolean {
  // In Electron with Chromium, we have broader codec support
  // Check platform for native ALAC support
  const platform = process.platform;

  // macOS always supports ALAC natively
  if (platform === 'darwin') {
    return true;
  }

  // Windows 10+ supports ALAC
  if (platform === 'win32') {
    const os = require('os');
    const version = os.release().split('.')[0];
    return parseInt(version) >= 10;
  }

  // Linux support varies, but modern Chromium usually handles it
  return true;
}

/**
 * Check if file extension is in supported list
 */
function isSupportedExtension(ext: string): boolean {
  const supported = [
    'mp3', 'mpeg', 'opus', 'ogg', 'oga',
    'wav', 'aac', 'caf', 'm4a', 'm4b',
    'mp4', 'weba', 'webm', 'flac'
  ];
  return supported.includes(ext);
}

/**
 * Get recommended format for transcoding if needed
 */
export function getTranscodeTarget(codecInfo: CodecInfo): string {
  if (!codecInfo.fallbackRequired) {
    return codecInfo.codec;
  }

  // For unsupported lossless, use FLAC
  if (codecInfo.isLossless) {
    return 'flac';
  }

  // For unsupported lossy, use MP3
  return 'mp3';
}