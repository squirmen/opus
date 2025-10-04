import { sql } from "drizzle-orm";

export function addLibrarySourcesMigration(sqlite: any) {
  try {
    const tableExists = sqlite.prepare(`
      SELECT name FROM sqlite_master
      WHERE type='table' AND name='librarySources'
    `).get();

    if (!tableExists) {
      sqlite.exec(`
        CREATE TABLE librarySources (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          path TEXT NOT NULL UNIQUE,
          name TEXT NOT NULL,
          type TEXT NOT NULL DEFAULT 'local',
          enabled INTEGER DEFAULT 1,
          lastScanned INTEGER,
          fileCount INTEGER DEFAULT 0,
          createdAt INTEGER NOT NULL
        )
      `);

      const columnExists = sqlite.prepare(`
        SELECT * FROM pragma_table_info('songs')
        WHERE name='sourceId'
      `).get();

      if (!columnExists) {
        sqlite.exec(`ALTER TABLE songs ADD COLUMN sourceId INTEGER`);

        const settings = sqlite.prepare("SELECT musicFolder FROM settings LIMIT 1").get() as any;

        if (settings?.musicFolder) {
          const result = sqlite.prepare(`
            INSERT INTO librarySources (path, name, type, enabled, createdAt, lastScanned)
            VALUES (?, ?, 'local', 1, ?, ?)
          `).run(
            settings.musicFolder,
            'Main Library',
            Date.now(),
            Date.now()
          );

          if (result.lastInsertRowid) {
            sqlite.prepare(`UPDATE songs SET sourceId = ?`).run(result.lastInsertRowid);
          }
        }
      }

      console.log("Library sources migration completed successfully");
      return true;
    }

    return false;
  } catch (error) {
    console.error("Library sources migration failed:", error);
    throw error;
  }
}