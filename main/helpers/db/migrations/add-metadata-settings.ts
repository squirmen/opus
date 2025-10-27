export function addMetadataSettingsMigration(sqlite: any) {
  try {
    // Check if the column already exists
    const columnExists = sqlite.prepare(`
      SELECT * FROM pragma_table_info('settings')
      WHERE name='includeFilesWithoutMetadata'
    `).get();

    if (!columnExists) {
      // Add the new column with a default value of 1 (true)
      sqlite.exec(`
        ALTER TABLE settings
        ADD COLUMN includeFilesWithoutMetadata INTEGER DEFAULT 1
      `);

      console.log("Added includeFilesWithoutMetadata column to settings table");
      return true;
    }

    return false;
  } catch (error) {
    console.error("Metadata settings migration failed:", error);
    throw error;
  }
}