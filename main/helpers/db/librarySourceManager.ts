import { db } from "./connectDB";
import { librarySources, songs } from "./schema";
import { eq, and, inArray } from "drizzle-orm";
import * as fs from "fs";
import * as path from "path";

export interface LibrarySource {
  id: number;
  path: string;
  name: string;
  type: string;
  enabled: boolean;
  lastScanned: number | null;
  fileCount: number;
  createdAt: number;
}

export class LibrarySourceManager {
  static async getAllSources(): Promise<LibrarySource[]> {
    try {
      return db.select().from(librarySources).all();
    } catch (error) {
      console.error("Failed to get library sources:", error);
      throw new Error("Failed to load library sources");
    }
  }

  static async getEnabledSources(): Promise<LibrarySource[]> {
    try {
      return db.select()
        .from(librarySources)
        .where(eq(librarySources.enabled, true))
        .all();
    } catch (error) {
      console.error("Failed to get enabled sources:", error);
      throw new Error("Failed to load enabled library sources");
    }
  }

  static async addSource(sourcePath: string, name: string, type: string = 'local'): Promise<LibrarySource> {
    try {
      if (!sourcePath || !name) {
        throw new Error("Path and name are required");
      }

      if (!fs.existsSync(sourcePath)) {
        throw new Error(`Path does not exist: ${sourcePath}`);
      }

      const stats = fs.statSync(sourcePath);
      if (!stats.isDirectory()) {
        throw new Error(`Path is not a directory: ${sourcePath}`);
      }

      const existing = await db.select()
        .from(librarySources)
        .where(eq(librarySources.path, sourcePath))
        .get();

      if (existing) {
        throw new Error(`Source already exists: ${sourcePath}`);
      }

      const result = await db.insert(librarySources)
        .values({
          path: sourcePath,
          name: name.trim(),
          type: type,
          enabled: true,
          createdAt: Date.now()
        })
        .returning()
        .get();

      return result;
    } catch (error) {
      if (error instanceof Error) {
        throw error;
      }
      throw new Error("Failed to add library source");
    }
  }

  static async removeSource(sourceId: number): Promise<void> {
    try {
      await db.delete(songs)
        .where(eq(songs.sourceId, sourceId));

      await db.delete(librarySources)
        .where(eq(librarySources.id, sourceId));
    } catch (error) {
      console.error("Failed to remove source:", error);
      throw new Error("Failed to remove library source");
    }
  }

  static async toggleSource(sourceId: number, enabled: boolean): Promise<void> {
    try {
      await db.update(librarySources)
        .set({ enabled })
        .where(eq(librarySources.id, sourceId));
    } catch (error) {
      console.error("Failed to toggle source:", error);
      throw new Error("Failed to toggle library source");
    }
  }

  static async updateSourceStats(sourceId: number, fileCount: number): Promise<void> {
    try {
      await db.update(librarySources)
        .set({
          fileCount,
          lastScanned: Date.now()
        })
        .where(eq(librarySources.id, sourceId));
    } catch (error) {
      console.error("Failed to update source stats:", error);
      throw new Error("Failed to update library source statistics");
    }
  }

  static async clearSources(sourceIds: number[]): Promise<number> {
    try {
      if (sourceIds.length === 0) return 0;

      const result = await db.delete(songs)
        .where(inArray(songs.sourceId, sourceIds))
        .returning({ id: songs.id })
        .all();

      for (const sourceId of sourceIds) {
        await db.update(librarySources)
          .set({ fileCount: 0 })
          .where(eq(librarySources.id, sourceId));
      }

      return result.length;
    } catch (error) {
      console.error("Failed to clear sources:", error);
      throw new Error("Failed to clear library sources");
    }
  }

  static async getSourceByPath(sourcePath: string): Promise<LibrarySource | undefined> {
    try {
      return db.select()
        .from(librarySources)
        .where(eq(librarySources.path, sourcePath))
        .get();
    } catch (error) {
      console.error("Failed to get source by path:", error);
      return undefined;
    }
  }

  static async renameSource(sourceId: number, newName: string): Promise<void> {
    try {
      if (!newName || !newName.trim()) {
        throw new Error("Name cannot be empty");
      }

      await db.update(librarySources)
        .set({ name: newName.trim() })
        .where(eq(librarySources.id, sourceId));
    } catch (error) {
      console.error("Failed to rename source:", error);
      throw new Error("Failed to rename library source");
    }
  }

  static async getAllScanPaths(): Promise<string[]> {
    try {
      const sources = await this.getEnabledSources();
      return sources.map(s => s.path);
    } catch (error) {
      console.error("Failed to get scan paths:", error);
      return [];
    }
  }

  static async migrateFromSingleFolder(musicFolder: string | null): Promise<void> {
    try {
      if (!musicFolder) return;

      const existingSources = await this.getAllSources();
      if (existingSources.length > 0) return;

      if (fs.existsSync(musicFolder)) {
        await this.addSource(musicFolder, 'Main Library', 'local');
      }
    } catch (error) {
      console.error("Failed to migrate from single folder:", error);
    }
  }
}