import { and, eq, like, sql, or, exists, isNotNull } from "drizzle-orm";
import { albums, songs, settings, playlistSongs, playlists, librarySources } from "./schema";
import fs from "fs";
import { parseFile, selectCover } from "music-metadata";
import path from "path";
import { BetterSQLite3Database, drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema";
import { sqlite } from "./createDB";
import { app } from "electron";
import { LibrarySourceManager } from "./librarySourceManager";
import { addLibrarySourcesMigration } from "./migrations/add-library-sources";
import { addMetadataSettingsMigration } from "./migrations/add-metadata-settings";

export const db: BetterSQLite3Database<typeof schema> = drizzle(sqlite, {
  schema,
});

const APP_DATA = app.getPath("userData");
const ART_DIR = path.join(APP_DATA, "utilities/uploads/covers");

const audioExtensions = [
  ".mp3",
  ".mpeg",
  ".opus",
  ".ogg",
  ".oga",
  ".wav",
  ".aac",
  ".caf",
  ".m4a",  // Supports both AAC and ALAC codecs
  ".m4b",
  ".mp4",
  ".weba",
  ".webm",
  ".dolby",
  ".flac",
];

const imageExtensions = [".png", ".jpg", ".jpeg", ".gif", ".bmp", ".webp"];

const processedImages = new Map();

function isAudioFile(filePath: string): boolean {
  return audioExtensions.includes(path.extname(filePath).toLowerCase());
}

function findFirstImageInDirectory(dir: string): string | null {
  if (processedImages.has(dir)) {
    return processedImages.get(dir);
  }

  try {
    const files = fs.readdirSync(dir);
    for (const file of files) {
      const filePath = path.join(dir, file);
      const stat = fs.statSync(filePath);
      if (
        stat.isFile() &&
        imageExtensions.includes(path.extname(file).toLowerCase())
      ) {
        processedImages.set(dir, filePath);
        return filePath;
      }
    }
  } catch (error) {
    console.error(`Error reading directory ${dir}:`, error);
  }

  processedImages.set(dir, null);
  return null;
}

function readFilesRecursively(dir: string, batch = 100): string[] {
  let results: string[] = [];
  let stack = [dir];
  let count = 0;

  while (stack.length > 0 && count < batch) {
    const currentDir = stack.pop();
    try {
      const items = fs.readdirSync(currentDir);

      for (const item of items) {
        const itemPath = path.join(currentDir, item);
        try {
          const stat = fs.statSync(itemPath);

          if (stat.isDirectory()) {
            stack.push(itemPath);
          } else if (isAudioFile(itemPath)) {
            results.push(itemPath);
            count++;
            if (count >= batch) break;
          }
        } catch (err) {
          console.error(`Error accessing ${itemPath}:`, err);
        }
      }
    } catch (err) {
      console.error(`Error reading directory ${currentDir}:`, err);
    }
  }

  return results;
}

function scanEntireLibrary(dir: string): string[] {
  let results: string[] = [];

  try {
    const items = fs.readdirSync(dir);

    const chunkSize = 50;
    for (let i = 0; i < items.length; i += chunkSize) {
      const chunk = items.slice(i, i + chunkSize);

      for (const item of chunk) {
        const itemPath = path.join(dir, item);
        try {
          const stat = fs.statSync(itemPath);
          if (stat.isDirectory()) {
            results.push(...scanEntireLibrary(itemPath));
          } else if (isAudioFile(itemPath)) {
            results.push(itemPath);
          }
        } catch (err) {
          console.error(`Error accessing ${itemPath}:`, err);
        }
      }
    }
  } catch (err) {
    console.error(`Error reading directory ${dir}:`, err);
  }

  return results;
}

export const getLibraryStats = async () => {
  // Count only songs from enabled sources
  const songCount = await db
    .select({ count: sql`count(*)` })
    .from(songs)
    .innerJoin(librarySources, eq(songs.sourceId, librarySources.id))
    .where(eq(librarySources.enabled, true));

  // Count only albums that have songs from enabled sources
  const albumCount = await db
    .select({ count: sql`count(DISTINCT ${albums.id})` })
    .from(albums)
    .innerJoin(songs, eq(songs.albumId, albums.id))
    .innerJoin(librarySources, eq(songs.sourceId, librarySources.id))
    .where(eq(librarySources.enabled, true));

  const playlistCount = await db
    .select({ count: sql`count(*)` })
    .from(playlists);

  return {
    songs: songCount[0].count,
    albums: albumCount[0].count,
    playlists: playlistCount[0].count,
  };
};

export const getSettings = async () => {
  const settings = await db.select().from(schema.settings).limit(1);
  return settings[0];
};

export const updateSettings = async (data: any) => {
  const currentSettings = await db.select().from(settings);

  if (currentSettings[0].profilePicture) {
    try {
      fs.unlinkSync(currentSettings[0].profilePicture);
    } catch (error) {
      console.error("Error deleting old profile picture:", error);
    }
  }

  await db.update(settings).set({
    name: data.name,
    profilePicture: data.profilePicture,
  });

  return true;
};

export const getSongs = async (page: number = 1, limit: number = 30) => {
  return await db.query.songs.findMany({
    with: {
      album: true,
      source: true
    },
    where: (songs, { exists }) => exists(
      db.select()
        .from(librarySources)
        .where(and(
          eq(librarySources.id, songs.sourceId),
          eq(librarySources.enabled, true)
        ))
    ),
    limit: limit,
    offset: (page - 1) * limit,
    orderBy: (songs, { asc }) => [asc(songs.name)],
  });
};

export const getAlbums = async (page: number, limit: number = 15) => {
  // Get albums with pagination - only albums with songs from enabled sources
  const albumsResult = await db
    .select()
    .from(albums)
    .where(
      exists(
        db.select()
          .from(songs)
          .innerJoin(librarySources, eq(songs.sourceId, librarySources.id))
          .where(and(
            eq(songs.albumId, albums.id),
            eq(librarySources.enabled, true)
          ))
      )
    )
    .orderBy(albums.name)
    .limit(limit)
    .offset((page - 1) * limit);

  // Get durations for these albums - only count songs from enabled sources
  const albumsWithDuration = await Promise.all(
    albumsResult.map(async (album) => {
      // Get total duration from songs in this album that are from enabled sources
      const durationResult = await db
        .select({ totalDuration: sql`SUM(${songs.duration})` })
        .from(songs)
        .innerJoin(librarySources, eq(songs.sourceId, librarySources.id))
        .where(and(
          eq(songs.albumId, album.id),
          eq(librarySources.enabled, true)
        ));

      return {
        ...album,
        duration: durationResult[0]?.totalDuration || 0,
      };
    }),
  );

  return albumsWithDuration;
};

export const getPlaylists = async () => {
  return await db.select().from(playlists);
};

export const createPlaylist = async (data: any) => {
  let description: string;
  let cover: string;

  if (data.description) {
    description = data.description;
  } else {
    description = "An epic playlist created by you.";
  }

  if (data.cover) {
    cover = data.cover;
  } else {
    cover = null;
  }

  const playlist = await db.insert(playlists).values({
    name: data.name,
    description: description,
    cover: cover,
  });

  return playlist;
};

export const deletePlaylist = async (data: { id: number }) => {
  await db.transaction(async (tx) => {
    // Remove all links in playlistSongs
    await tx.delete(playlistSongs).where(eq(playlistSongs.playlistId, data.id));

    // Now delete the playlist
    const result = await tx.delete(playlists).where(eq(playlists.id, data.id));
    if ("changes" in result && result.changes === 0) {
      throw new Error(`Playlist ${data.id} not found`);
    }
  });

  return { message: `Playlist ${data.id} deleted successfully` };
};

export const updatePlaylist = async (data: any) => {
  let description: string;
  let cover: string;

  if (data.data.description) {
    description = data.data.description;
  } else {
    description = "An epic playlist created by you.";
  }

  if (data.cover) {
    cover = data.data.cover;
  }

  const playlist = await db
    .update(playlists)
    .set({
      name: data.data.name,
      description: description,
      cover: cover,
    })
    .where(eq(playlists.id, data.id));

  return playlist;
};

export const getAlbumWithSongs = async (id: number) => {
  const albumWithSongs = await db.query.albums.findFirst({
    where: eq(albums.id, id),
    with: {
      songs: {
        where: (songs, { exists }) => exists(
          db.select()
            .from(librarySources)
            .where(and(
              eq(librarySources.id, songs.sourceId),
              eq(librarySources.enabled, true)
            ))
        ),
        with: {
          album: true,
          source: true
        },
      },
    },
  });

  if (albumWithSongs) {
    // Calculate total duration from all songs in this album (from enabled sources only)
    const totalDuration = albumWithSongs.songs.reduce(
      (total, song) => total + (song.duration || 0),
      0,
    );

    return {
      ...albumWithSongs,
      duration: totalDuration,
    };
  }

  return albumWithSongs;
};

export const getPlaylistWithSongs = async (id: number) => {
  const playlistWithSongs = await db.query.playlists.findFirst({
    where: eq(playlists.id, id),
    with: {
      songs: {
        with: {
          song: {
            where: (songs, { exists }) => exists(
              db.select()
                .from(librarySources)
                .where(and(
                  eq(librarySources.id, songs.sourceId),
                  eq(librarySources.enabled, true)
                ))
            ),
            with: {
              album: true,
              source: true
            },
          },
        },
      },
    },
  });

  return {
    ...playlistWithSongs,
    songs: playlistWithSongs.songs
      .filter(ps => ps.song !== null) // Filter out songs that were excluded due to disabled sources
      .map((playlistSong) => ({
        ...playlistSong.song,
        album: playlistSong.song.album,
      })),
  };
};

export const isSongFavorite = async (file: string) => {
  const song = await db.query.songs.findFirst({
    where: eq(songs.filePath, file),
  });

  if (!song) return false;

  const isFavourite = await db.query.playlistSongs.findFirst({
    where: and(
      eq(playlistSongs.playlistId, 1),
      eq(playlistSongs.songId, song.id),
    ),
  });

  return !!isFavourite;
};

export const addToFavourites = async (songId: number) => {
  const existingEntry = await db
    .select()
    .from(playlistSongs)
    .where(
      and(eq(playlistSongs.playlistId, 1), eq(playlistSongs.songId, songId)),
    );

  if (!existingEntry[0]) {
    await db.insert(playlistSongs).values({
      playlistId: 1,
      songId,
    });
  } else {
    await db
      .delete(playlistSongs)
      .where(
        and(eq(playlistSongs.playlistId, 1), eq(playlistSongs.songId, songId)),
      );
  }
};

export const searchDB = async (query: string) => {
  const lowerSearch = query.toLowerCase();

  // Search albums that have songs from enabled sources
  const searchAlbums = await db.query.albums.findMany({
    where: (albums, { exists }) => and(
      like(albums.name, `%${lowerSearch}%`),
      exists(
        db.select()
          .from(songs)
          .innerJoin(librarySources, eq(songs.sourceId, librarySources.id))
          .where(and(
            eq(songs.albumId, albums.id),
            eq(librarySources.enabled, true)
          ))
      )
    ),
    limit: 5,
  });

  const searchPlaylists = await db.query.playlists.findMany({
    where: like(playlists.name, `%${lowerSearch}%`),
    limit: 5,
  });

  // Search songs from enabled sources only
  const searchSongs = await db.query.songs.findMany({
    where: (songs, { exists }) => and(
      like(songs.name, `%${lowerSearch}%`),
      exists(
        db.select()
          .from(librarySources)
          .where(and(
            eq(librarySources.id, songs.sourceId),
            eq(librarySources.enabled, true)
          ))
      )
    ),
    with: {
      album: {
        columns: {
          id: true,
          cover: true,
        },
      },
      source: true
    },
    limit: 5,
  });

  // Search for artists by querying unique artist names from albums that have songs from enabled sources
  const searchArtists = await db.query.albums.findMany({
    where: (albums, { exists }) => and(
      like(albums.artist, `%${lowerSearch}%`),
      exists(
        db.select()
          .from(songs)
          .innerJoin(librarySources, eq(songs.sourceId, librarySources.id))
          .where(and(
            eq(songs.albumId, albums.id),
            eq(librarySources.enabled, true)
          ))
      )
    ),
    columns: {
      artist: true,
    },
    limit: 5,
  });

  // Remove duplicate artists by name
  const uniqueArtists = Array.from(
    new Set(searchArtists.map((a) => a.artist)),
  ).map((name) => ({
    name,
  }));

  return {
    searchAlbums,
    searchPlaylists,
    searchSongs,
    searchArtists: uniqueArtists,
  };
};

export const addSongToPlaylist = async (playlistId: number, songId: number) => {
  const checkIfExists = await db.query.playlistSongs.findFirst({
    where: and(
      eq(playlistSongs.playlistId, playlistId),
      eq(playlistSongs.songId, songId),
    ),
  });

  if (checkIfExists) return false;

  await db.insert(playlistSongs).values({
    playlistId,
    songId,
  });

  return true;
};

export const removeSongFromPlaylist = async (
  playlistId: number,
  songId: number,
) => {
  await db
    .delete(playlistSongs)
    .where(
      and(
        eq(playlistSongs.playlistId, playlistId),
        eq(playlistSongs.songId, songId),
      ),
    );

  return true;
};

export const getRandomLibraryItems = async () => {
  // Get random albums that have songs from enabled sources
  const randomAlbums = await db
    .select()
    .from(albums)
    .where(
      exists(
        db.select()
          .from(songs)
          .innerJoin(librarySources, eq(songs.sourceId, librarySources.id))
          .where(and(
            eq(songs.albumId, albums.id),
            eq(librarySources.enabled, true)
          ))
      )
    )
    .orderBy(sql`RANDOM()`)
    .limit(10);

  // Add duration calculation for albums - only count songs from enabled sources
  const albumsWithDuration = await Promise.all(
    randomAlbums.map(async (album) => {
      // Get total duration from songs in this album from enabled sources
      const durationResult = await db
        .select({ totalDuration: sql`SUM(${songs.duration})` })
        .from(songs)
        .innerJoin(librarySources, eq(songs.sourceId, librarySources.id))
        .where(and(
          eq(songs.albumId, album.id),
          eq(librarySources.enabled, true)
        ));

      return {
        ...album,
        duration: durationResult[0]?.totalDuration || 0,
      };
    }),
  );

  // Get random songs from enabled sources only
  const randomSongs = await db.query.songs.findMany({
    with: {
      album: true,
      source: true
    },
    where: (songs, { exists }) => exists(
      db.select()
        .from(librarySources)
        .where(and(
          eq(librarySources.id, songs.sourceId),
          eq(librarySources.enabled, true)
        ))
    ),
    limit: 10,
    orderBy: sql`RANDOM()`,
  });

  return {
    albums: albumsWithDuration,
    songs: randomSongs,
  };
};

// Added incremental loading support
export const initializeData = async (
  musicFolder: string,
  incremental = false,
  providedSourceId?: number,
) => {
  if (!fs.existsSync(musicFolder)) {
    console.error("Music folder does not exist:", musicFolder);
    return false;
  }

  try {
    // Add default playlist if it doesn't exist
    const defaultPlaylist = await db
      .select()
      .from(playlists)
      .where(eq(playlists.id, 1));

    if (!defaultPlaylist[0]) {
      await db.insert(playlists).values({
        name: "Favourites",
        cover: null,
        description: "Songs liked by you.",
      });
    }

    // Only update settings if we're not scanning a specific source
    if (!providedSourceId) {
      const existingSettings = await db
        .select()
        .from(settings)
        .where(eq(settings.id, 1));

      if (existingSettings[0]) {
        await db.update(settings).set({ musicFolder }).where(eq(settings.id, 1));
      } else {
        await db.insert(settings).values({ musicFolder });
      }
    }

    // Create art directory if it doesn't exist
    if (!fs.existsSync(ART_DIR)) {
      await fs.promises.mkdir(ART_DIR, { recursive: true });
    }

    // Determine sourceId to use
    let sourceIdToUse = providedSourceId;

    if (!sourceIdToUse) {
      // Only try to get/create source if no sourceId was provided
      let source = await LibrarySourceManager.getSourceByPath(musicFolder);
      if (!source) {
        // Migrate from old system or create new source
        await LibrarySourceManager.migrateFromSingleFolder(musicFolder);
        source = await LibrarySourceManager.getSourceByPath(musicFolder);
      }
      sourceIdToUse = source?.id;
    }

    // First pass: Just load metadata or do a full scan based on incremental flag
    await processLibrary(musicFolder, incremental, sourceIdToUse);

    return true;
  } catch (error) {
    console.error("Error initializing data:", error);
    return false;
  }
};

// Batch process files to reduce memory usage and improve UI responsiveness
async function processLibrary(musicFolder: string, incremental = false, sourceId?: number) {
  const startTime = Date.now();

  // If we have a specific sourceId and not incremental, clear existing songs from this source
  if (sourceId && !incremental) {
    await db.delete(songs).where(eq(songs.sourceId, sourceId));
  }

  // Only get file paths from the current source when sourceId is provided
  const dbFilePaths = await getAllFilePathsFromDb(sourceId);

  if (incremental) {
    console.log("Starting incremental library scan...");

    // Scan only the immediate music folder first to reduce initial delay
    const initialBatch = scanImmediateDirectory(musicFolder);
    const batchSize = 100; // Increased from 50 for better throughput

    // Process the initial batch right away for quick UI updates
    await processBatch(initialBatch, dbFilePaths, sourceId);

    // Process the rest of the library in the background
    setTimeout(async () => {
      // Use a more efficient scanning algorithm for the full scan
      const allFiles = scanEntireLibrary(musicFolder);
      console.log(`Found ${allFiles.length} files in music library`);

      // Skip files we've already processed in the initial batch
      for (let i = initialBatch.length; i < allFiles.length; i += batchSize) {
        const batch = allFiles.slice(i, i + batchSize);
        await processBatch(batch, dbFilePaths, sourceId);

        // Yield to UI thread periodically but not too often (increased from 10ms)
        if (i % (batchSize * 5) === 0) {
          await new Promise((resolve) => setTimeout(resolve, 30));
        }
      }

      // Final cleanup - remove orphaned records
      await cleanupOrphanedRecords(allFiles);

      // Update source file count if we have a sourceId
      if (sourceId) {
        const songCount = await db.select({ count: sql`count(*)` })
          .from(songs)
          .where(eq(songs.sourceId, sourceId));
        await LibrarySourceManager.updateSourceStats(sourceId, Number(songCount[0].count));
      }

      console.log(
        `Library processing completed in ${(Date.now() - startTime) / 1000} seconds`,
      );
    }, 1000); // Reduced from 2000ms for faster startup
  } else {
    // Do full scan immediately if not incremental
    const allFiles = scanEntireLibrary(musicFolder);
    console.log(`Found ${allFiles.length} files in music library`);

    // Process in larger batches since we're not concerned about UI responsiveness
    const batchSize = 300; // Increased from 200 for better throughput

    for (let i = 0; i < allFiles.length; i += batchSize) {
      const batch = allFiles.slice(i, i + batchSize);
      await processBatch(batch, dbFilePaths, sourceId);

      // Still yield occasionally to prevent potential lockups
      if (i % (batchSize * 3) === 0) {
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
    }

    await cleanupOrphanedRecords(allFiles);

    // Update source file count if we have a sourceId
    if (sourceId) {
      const songCount = await db.select({ count: sql`count(*)` })
        .from(songs)
        .where(eq(songs.sourceId, sourceId));
      await LibrarySourceManager.updateSourceStats(sourceId, Number(songCount[0].count));
    }

    console.log(
      `Library processing completed in ${(Date.now() - startTime) / 1000} seconds`,
    );
  }
}

// Helper function to get all file paths from database
async function getAllFilePathsFromDb(sourceId?: number): Promise<Set<string>> {
  let query = db.select().from(songs);
  if (sourceId) {
    query = query.where(eq(songs.sourceId, sourceId));
  }
  const dbFiles = await query;
  return new Set(dbFiles.map((file) => file.filePath));
}

// Scan only the immediate directory for quick initial loading
function scanImmediateDirectory(dir: string): string[] {
  let results: string[] = [];

  try {
    const items = fs.readdirSync(dir);

    // First collect all audio files in the current directory
    for (const item of items) {
      const itemPath = path.join(dir, item);
      try {
        const stat = fs.statSync(itemPath);
        if (!stat.isDirectory() && isAudioFile(itemPath)) {
          results.push(itemPath);
        }
      } catch (err) {
        console.error(`Error accessing ${itemPath}:`, err);
      }
    }

    // Then check immediate subdirectories (but not recursively)
    for (const item of items) {
      const itemPath = path.join(dir, item);
      try {
        const stat = fs.statSync(itemPath);
        if (stat.isDirectory()) {
          const subItems = fs.readdirSync(itemPath);
          for (const subItem of subItems) {
            const subItemPath = path.join(itemPath, subItem);
            try {
              const subStat = fs.statSync(subItemPath);
              if (!subStat.isDirectory() && isAudioFile(subItemPath)) {
                results.push(subItemPath);
              }
            } catch (err) {
              console.error(`Error accessing ${subItemPath}:`, err);
            }
          }
        }
      } catch (err) {
        console.error(`Error accessing ${itemPath}:`, err);
      }
    }
  } catch (err) {
    console.error(`Error reading directory ${dir}:`, err);
  }

  return results;
}

async function processBatch(files: string[], dbFilePaths: Set<string>, sourceId?: number) {
  const albumCache = new Map();

  for (const file of files) {
    try {
      if (!dbFilePaths.has(file)) {
        // New file - add to database
        await processAudioFile(file, albumCache, sourceId);
      }
    } catch (error) {
      console.error(`Error processing file ${file}:`, error);
    }
  }
}

async function processAudioFile(file: string, albumCache: Map<string, any>, sourceId?: number) {
  try {
    // Validate sourceId exists
    if (!sourceId) {
      console.error(`No sourceId provided for file: ${file}`);
      return;
    }

    // Use more efficient metadata parsing with stripped options
    const metadata = await parseFile(file, {
      skipPostHeaders: true,
      skipCovers: false, // Still need covers
      duration: true,
      includeChapters: false,
    });

    // Check if we should skip files without metadata
    const settingsData = await db.select().from(settings).limit(1);
    const includeFilesWithoutMetadata = settingsData[0]?.includeFilesWithoutMetadata !== false; // Default to true

    // Skip files without title metadata if setting is disabled
    if (!metadata.common.title && !includeFilesWithoutMetadata) {
      console.log(`Skipping file without metadata: ${file}`);
      return;
    }

    // Use filename as fallback if no title metadata
    const fileBasename = path.basename(file, path.extname(file));
    const songTitle = metadata.common.title || fileBasename;

    const albumFolder = path.dirname(file);
    let artPath = null;

    // Create a unique key for this specific album/artist combination
    const albumArtKey = `${metadata.common.album || "Unknown Album"}-${metadata.common.artist || "Unknown Artist"}-art`;

    // Try to find album art in efficient order: cache first, then embedded, then folder
    if (albumCache.has(albumArtKey)) {
      // Reuse already processed art path from cache for this specific album
      artPath = albumCache.get(albumArtKey);
    } else {
      // First check for embedded art (most accurate for the specific track)
      if (
        metadata.common.picture &&
        metadata.common.picture.length > 0
      ) {
        const cover = selectCover(metadata.common.picture);
        if (cover) {
          artPath = await processEmbeddedArt(cover);
        }
      }

      // Fall back to folder image if no embedded art
      if (!artPath) {
        const albumImage = findFirstImageInDirectory(albumFolder);
        if (albumImage) {
          artPath = await processAlbumArt(albumImage);
        }
      }

      // Cache the art path for this specific album to avoid redundant processing
      albumCache.set(albumArtKey, artPath);
    }

    // Get or create album with better caching
    let album;
    const albumKey = `${metadata.common.album || "Unknown Album"}-${metadata.common.artist || "Unknown Artist"}`;

    if (albumCache.has(albumKey)) {
      album = albumCache.get(albumKey);
    } else {
      // Optimize the database lookup for album
      const albumsFound = await db
        .select()
        .from(albums)
        .where(eq(albums.name, metadata.common.album || "Unknown Album"));

      if (albumsFound.length > 0) {
        album = albumsFound[0];

        // Update album if needed (only when data differs)
        const albumArtist =
          metadata.common.albumartist ||
          metadata.common.artist ||
          "Various Artists";
        if (
          album.artist !== albumArtist ||
          album.year !== metadata.common.year ||
          (artPath && album.cover !== artPath)
        ) {
          await db
            .update(albums)
            .set({
              artist: albumArtist,
              year: metadata.common.year,
              cover: artPath || album.cover,
            })
            .where(eq(albums.id, album.id));

          // Update cached version
          album.artist = albumArtist;
          album.year = metadata.common.year;
          album.cover = artPath || album.cover;
        }
      } else {
        // Create new album with a single transaction
        const [newAlbum] = await db
          .insert(albums)
          .values({
            name: metadata.common.album || "Unknown Album",
            artist:
              metadata.common.albumartist ||
              metadata.common.artist ||
              "Various Artists",
            year: metadata.common.year,
            cover: artPath,
          })
          .returning();

        album = newAlbum;
      }

      albumCache.set(albumKey, album);
    }

    // Add the song using pre-calculated values to avoid repeated operations
    await db.insert(songs).values({
      filePath: file,
      name: songTitle,  // Use the title with filename fallback
      artist: metadata.common.artist || "Unknown Artist",
      duration: Math.round(metadata.format.duration || 0),
      albumId: album.id,
      sourceId: sourceId,
    });
  } catch (error) {
    console.error(`Error processing audio file ${file}:`, error);
  }
}

async function processAlbumArt(imagePath: string): Promise<string> {
  try {
    // Use a shorter hash method for faster processing
    const crypto = require("crypto");
    const imageExt = path.extname(imagePath).slice(1);

    // Generate hash from filename and modified time instead of reading the whole file
    // This is much faster for large image files
    const stats = fs.statSync(imagePath);
    const hashInput = `${imagePath}-${stats.size}-${stats.mtimeMs}`;
    const hash = crypto.createHash("md5").update(hashInput).digest("hex");

    const artPath = path.join(ART_DIR, `${hash}.${imageExt}`);

    // If the processed file already exists, return its path immediately
    if (fs.existsSync(artPath)) {
      return artPath;
    }

    // Only read the file if we need to process it
    const imageData = fs.readFileSync(imagePath);

    // For common image formats that don't need processing, just copy the file
    if (imageExt.match(/^(jpe?g|png|webp)$/i)) {
      await fs.promises.writeFile(artPath, imageData);
      return artPath;
    }

    // For other formats, we might want to convert them (implementation depends on available modules)
    // For now, just save as is
    await fs.promises.writeFile(artPath, imageData);
    return artPath;
  } catch (error) {
    console.error("Error processing album art:", error);
    return null;
  }
}

async function processEmbeddedArt(cover: any): Promise<string> {
  try {
    // If we don't have cover data, return early
    if (!cover || !cover.data) {
      return null;
    }

    // Generate a hash based on a small sample of the image data
    // Using the full data can be slow for large embedded images
    const sampleSize = Math.min(cover.data.length, 4096); // Sample first 4KB
    const sampleBuffer = cover.data.slice(0, sampleSize);

    const crypto = require("crypto");
    const hash = crypto.createHash("md5").update(sampleBuffer).digest("hex");

    const format = cover.format ? cover.format.split("/")[1] || "jpg" : "jpg";

    const artPath = path.join(ART_DIR, `${hash}.${format}`);

    // Skip writing if it already exists
    if (fs.existsSync(artPath)) {
      return artPath;
    }

    // Write the full image data
    await fs.promises.writeFile(artPath, cover.data);
    return artPath;
  } catch (error) {
    console.error("Error processing embedded art:", error);
    return null;
  }
}

async function cleanupOrphanedRecords(currentFiles: string[]) {
  // Create a set of current file paths for faster lookups
  const currentFilesSet = new Set(currentFiles);

  // Get all songs from the database
  const dbFiles = await db.select().from(songs);

  // Find songs that no longer exist
  const deletedFiles = dbFiles.filter(
    (dbFile) => !currentFilesSet.has(dbFile.filePath),
  );

  if (deletedFiles.length > 0) {
    console.log(`Removing ${deletedFiles.length} orphaned song records`);

    // Delete in batches to avoid locking the database for too long
    const batchSize = 50;
    for (let i = 0; i < deletedFiles.length; i += batchSize) {
      const batch = deletedFiles.slice(i, i + batchSize);

      // BetterSQLite3 doesn't support async transactions, so we'll execute the deletes directly
      for (const file of batch) {
        await db.delete(playlistSongs).where(eq(playlistSongs.songId, file.id));
        await db.delete(songs).where(eq(songs.id, file.id));
      }
    }
  }

  // Clean up empty albums
  const allAlbums = await db.select().from(albums);

  for (const album of allAlbums) {
    const songsInAlbum = await db
      .select()
      .from(songs)
      .where(eq(songs.albumId, album.id));

    if (songsInAlbum.length === 0) {
      await db.delete(albums).where(eq(albums.id, album.id));
    }
  }
}

// Clear all songs from the library
export const clearAllSongs = async (): Promise<number> => {
  try {
    // Get count of songs before clearing
    const songCount = await db.select({ count: sql`count(*)` }).from(songs);
    const deletedCount = Number(songCount[0].count);

    // Delete all songs and related data
    // BetterSQLite3 doesn't support async transactions, execute directly
    await db.delete(playlistSongs).execute();
    await db.delete(songs).execute();
    await db.delete(albums).execute();
    await db.update(librarySources)
      .set({ fileCount: 0, lastScanned: null })
      .execute();

    // Clear image cache
    processedImages.clear();

    return deletedCount;
  } catch (error) {
    console.error("Error clearing all songs:", error);
    throw error;
  }
};

// Migrate database to add columns that might be missing
export const migrateDatabase = async () => {
  try {
    console.log("Checking database schema for migrations...");

    // Run library sources migration first - pass the raw sqlite instance
    addLibrarySourcesMigration(sqlite);

    // Run metadata settings migration
    addMetadataSettingsMigration(sqlite);

    // Check if LastFM columns exist in settings table
    const tableInfo = sqlite
      .prepare("PRAGMA table_info(settings)")
      .all() as Array<{ name: string }>;
    const columnNames = tableInfo.map((col) => col.name);

    const missingColumns = [];

    // Check for lastFmUsername column
    if (!columnNames.includes("lastFmUsername")) {
      missingColumns.push("lastFmUsername TEXT");
    }

    // Check for lastFmSessionKey column
    if (!columnNames.includes("lastFmSessionKey")) {
      missingColumns.push("lastFmSessionKey TEXT");
    }

    // Check for enableLastFm column
    if (!columnNames.includes("enableLastFm")) {
      missingColumns.push("enableLastFm INTEGER DEFAULT 0");
    }

    // Check for scrobbleThreshold column
    if (!columnNames.includes("scrobbleThreshold")) {
      missingColumns.push("scrobbleThreshold INTEGER DEFAULT 50");
    }

    // Add missing columns if any
    if (missingColumns.length > 0) {
      console.log(
        `Adding ${missingColumns.length} missing columns to settings table...`,
      );

      for (const columnDef of missingColumns) {
        const alterSql = `ALTER TABLE settings ADD COLUMN ${columnDef}`;
        sqlite.exec(alterSql);
        console.log(`Added column: ${columnDef}`);
      }

      console.log("Database migration completed successfully.");
    } else {
      console.log("Database schema is up to date, no migration needed.");
    }

    return true;
  } catch (error) {
    console.error("Error during database migration:", error);
    return false;
  }
};

// Helper function to send messages to the renderer process
function sendToRenderer(channel: string, data: any) {
  try {
    // Check if we have access to the webContents
    const { BrowserWindow } = require("electron");
    const win = BrowserWindow.getAllWindows()[0];
    if (win && win.webContents) {
      win.webContents.send(channel, data);
    }
  } catch (error) {
    console.error(`Failed to send message to renderer: ${error}`);
  }
}

export const getArtistWithAlbums = async (artist: string) => {
  try {
    if (!artist) {
      console.log("Missing artist name in getArtistWithAlbums");
      return {
        name: "Unknown Artist",
        albums: [],
        albumsWithSongs: [],
        songs: [],
        stats: null,
      };
    }

    // Get all albums by this artist that have songs from enabled sources
    const artistAlbums = await db
      .select()
      .from(albums)
      .where(and(
        eq(albums.artist, artist),
        exists(
          db.select()
            .from(songs)
            .innerJoin(librarySources, eq(songs.sourceId, librarySources.id))
            .where(and(
              eq(songs.albumId, albums.id),
              eq(librarySources.enabled, true)
            ))
        )
      ))
      .orderBy(albums.year);

    // Get all songs by this artist (across all albums) from enabled sources only
    const artistSongs = await db.query.songs.findMany({
      where: (songs, { exists }) => and(
        eq(songs.artist, artist),
        exists(
          db.select()
            .from(librarySources)
            .where(and(
              eq(librarySources.id, songs.sourceId),
              eq(librarySources.enabled, true)
            ))
        )
      ),
      with: {
        album: true,
        source: true
      },
      orderBy: (songs, { asc }) => [asc(songs.name)],
    });

    // Group songs by albums for better organization - only songs from enabled sources
    const albumsWithSongs = await Promise.all(
      artistAlbums.map(async (album) => {
        const albumSongs = await db.query.songs.findMany({
          where: (songs, { exists }) => and(
            eq(songs.albumId, album.id),
            exists(
              db.select()
                .from(librarySources)
                .where(and(
                  eq(librarySources.id, songs.sourceId),
                  eq(librarySources.enabled, true)
                ))
            )
          ),
          with: {
            album: true,
            source: true
          },
          orderBy: (songs, { asc }) => [asc(songs.name)],
        });

        return {
          ...album,
          songs: albumSongs,
        };
      }),
    );

    // Calculate statistics
    const totalDuration = artistSongs.reduce((sum, song) => sum + (song.duration || 0), 0);
    const genres = new Set<string>();
    const formats = new Set<string>();
    
    // Extract genres and formats from songs
    artistSongs.forEach(song => {
      if (song.filePath) {
        const ext = song.filePath.split('.').pop()?.toUpperCase();
        if (ext) formats.add(ext);
      }
    });

    // Get year range
    const years = artistAlbums.filter(a => a.year).map(a => a.year);
    const yearRange = years.length > 0 
      ? { start: Math.min(...years), end: Math.max(...years) }
      : null;

    // Get most played song (would need play count tracking, using random for now)
    const topSongs = artistSongs.slice(0, 5).map(song => ({
      id: song.id,
      name: song.name,
      duration: song.duration,
      album: song.album?.name || "Unknown Album",
    }));

    const stats = {
      totalSongs: artistSongs.length,
      totalAlbums: artistAlbums.length,
      totalDuration,
      genres: Array.from(genres),
      formats: Array.from(formats),
      yearRange,
      topSongs,
    };

    return {
      name: artist,
      albums: artistAlbums,
      albumsWithSongs: albumsWithSongs,
      songs: artistSongs,
      stats,
    };
  } catch (error) {
    console.error(`Error in getArtistWithAlbums for "${artist}":`, error);
    return {
      name: artist || "Unknown Artist",
      albums: [],
      albumsWithSongs: [],
      songs: [],
      stats: null,
    };
  }
};

export const getAllArtists = async () => {
  try {
    const albumArtists = await db
      .selectDistinct({ artist: albums.artist })
      .from(albums)
      .where(isNotNull(albums.artist));

    const songArtists = await db
      .selectDistinct({ artist: songs.artist })
      .from(songs)
      .where(isNotNull(songs.artist));

    const artistNames = new Set<string>();
    albumArtists.forEach(a => {
      if (a.artist) artistNames.add(a.artist);
    });
    songArtists.forEach(s => {
      if (s.artist) artistNames.add(s.artist);
    });

    const artistStats = await db
      .select({
        artist: albums.artist,
        albumCount: sql<number>`COUNT(DISTINCT ${albums.id})`,
        cover: sql<string>`MAX(${albums.cover})`
      })
      .from(albums)
      .where(isNotNull(albums.artist))
      .groupBy(albums.artist);

    const songStats = await db
      .select({
        artist: songs.artist,
        songCount: sql<number>`COUNT(*)`
      })
      .from(songs)
      .where(isNotNull(songs.artist))
      .groupBy(songs.artist);

    const songCountMap = new Map<string, number>();
    songStats.forEach(s => {
      if (s.artist) {
        songCountMap.set(s.artist, Number(s.songCount));
      }
    });

    // Combine the data
    const artistsWithDetails = Array.from(artistNames).map(artistName => {
      const albumData = artistStats.find(a => a.artist === artistName);
      return {
        name: artistName,
        albumCount: albumData ? Number(albumData.albumCount) : 0,
        songCount: songCountMap.get(artistName) || 0,
        cover: albumData?.cover || null,
      };
    });

    // Sort by artist name
    return artistsWithDetails.sort((a, b) => 
      a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
    );
  } catch (error) {
    console.error("Error getting all artists:", error);
    return [];
  }
};

export const searchSongs = async (query: string) => {
  if (!query || query.trim() === "") {
    return [];
  }

  // Normalize the search query
  const searchTerm = `%${query.toLowerCase().trim()}%`;

  // Efficiently search for songs matching the query across name, artist and album name
  const searchResults = await db.query.songs.findMany({
    where: (songs, { exists }) => and(
      // Filter by enabled library sources
      exists(
        db.select()
          .from(librarySources)
          .where(and(
            eq(librarySources.id, songs.sourceId),
            eq(librarySources.enabled, true)
          ))
      ),
      // Search query
      or(
        like(songs.name, searchTerm),
        like(songs.artist, searchTerm),
        // Join with albums to search by album name
        exists(
          db
            .select()
            .from(albums)
            .where(
              and(eq(albums.id, songs.albumId), like(albums.name, searchTerm)),
            ),
        ),
      )
    ),
    with: {
      album: true,
      source: true
    },
    // Limit to a reasonable number to avoid performance issues
    limit: 100,
    orderBy: (songs, { asc }) => [asc(songs.name)],
  });

  return searchResults;
};

export const getAlbumsWithDuration = async (
  page: number = 1,
  limit: number = 15,
) => {
  // Get albums with pagination - only albums with songs from enabled sources
  const albumsResult = await db
    .select()
    .from(albums)
    .where(
      exists(
        db.select()
          .from(songs)
          .innerJoin(librarySources, eq(songs.sourceId, librarySources.id))
          .where(and(
            eq(songs.albumId, albums.id),
            eq(librarySources.enabled, true)
          ))
      )
    )
    .orderBy(albums.name)
    .limit(limit)
    .offset((page - 1) * limit);

  // Get durations for these albums in a single batch query for better performance
  const albumIds = albumsResult.map((album) => album.id);

  // If no albums were found, return empty array
  if (albumIds.length === 0) {
    return [];
  }

  // Query total durations for all albums in a single database call - only from enabled sources
  const durationResults = await db
    .select({
      albumId: songs.albumId,
      totalDuration: sql`SUM(${songs.duration})`,
    })
    .from(songs)
    .innerJoin(librarySources, eq(songs.sourceId, librarySources.id))
    .where(and(
      sql`${songs.albumId} IN (${albumIds.join(",")})`,
      eq(librarySources.enabled, true)
    ))
    .groupBy(songs.albumId);

  // Create a duration lookup map for efficient access
  const durationMap = new Map();
  durationResults.forEach((result) => {
    durationMap.set(result.albumId, result.totalDuration || 0);
  });

  // Map the albums with their durations
  const albumsWithDurations = albumsResult.map((album) => {
    return {
      ...album,
      duration: durationMap.get(album.id) || 0,
    };
  });

  return albumsWithDurations;
};

// Add these functions at the end of the file

// LastFM related functions
export const updateLastFmSettings = async (data: {
  lastFmUsername: string;
  lastFmSessionKey: string;
  enableLastFm: boolean;
  scrobbleThreshold: number;
}) => {
  try {
    const currentSettings = await db.select().from(settings);

    if (currentSettings.length === 0) {
      // Create new settings if none exist
      await db.insert(settings).values({
        lastFmUsername: data.lastFmUsername,
        lastFmSessionKey: data.lastFmSessionKey,
        enableLastFm: data.enableLastFm,
        scrobbleThreshold: data.scrobbleThreshold || 50,
      });
    } else {
      // Update existing settings
      await db
        .update(settings)
        .set({
          lastFmUsername: data.lastFmUsername,
          lastFmSessionKey: data.lastFmSessionKey,
          enableLastFm: data.enableLastFm,
          scrobbleThreshold: data.scrobbleThreshold || 50,
        })
        .where(eq(settings.id, currentSettings[0].id));
    }

    return true;
  } catch (error) {
    console.error("Error updating LastFM settings:", error);
    return false;
  }
};

export const getLastFmSettings = async () => {
  try {
    const settingsRow = await db
      .select({
        lastFmUsername: settings.lastFmUsername,
        lastFmSessionKey: settings.lastFmSessionKey,
        enableLastFm: settings.enableLastFm,
        scrobbleThreshold: settings.scrobbleThreshold,
      })
      .from(settings)
      .limit(1);

    if (settingsRow.length === 0) {
      return {
        lastFmUsername: null,
        lastFmSessionKey: null,
        enableLastFm: false,
        scrobbleThreshold: 50,
      };
    }

    return settingsRow[0];
  } catch (error) {
    console.error("Error getting LastFM settings:", error);
    return {
      lastFmUsername: null,
      lastFmSessionKey: null,
      enableLastFm: false,
      scrobbleThreshold: 50,
    };
  }
};
