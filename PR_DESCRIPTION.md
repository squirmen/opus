# feat: Add ALAC/M4A codec support and multiple library sources

## Summary

This PR adds two major features to Wora:
1. **ALAC/M4A codec support** - Enhanced playback for Apple Lossless and AAC files
2. **Multiple library sources** - Manage music from multiple folders

## Features

### 🎵 ALAC/M4A Codec Support
- Auto-detection of codec type in M4A/M4B/MP4 files
- Proper display of lossless indicator for ALAC files
- Improved codec information display in player
- Let Howler.js auto-detect formats for better compatibility

### 📁 Multiple Library Sources
- Add unlimited music folders to your library
- Enable/disable sources without removing them
- Scan individual sources or all at once
- Remove sources (with confirmation)
- Rename sources for organization
- View file count and last scan date for each source

## Technical Details

### Database Changes
- New `librarySources` table for managing multiple folders
- Added `sourceId` to songs table to track source
- Safe migration from single-folder system
- All queries now filter by enabled sources only

### UI Improvements
- New library sources manager in Settings
- Toast notifications for all operations
- Loading states and proper error handling
- Confirmation dialogs for destructive actions

### Code Quality
- Comprehensive error handling
- Proper logging with electron logger
- Input validation on all user inputs
- Fixed SQL injection vulnerability
- Removed dead code

## Testing Checklist
- [x] ALAC files play correctly
- [x] Lossless indicator shows for ALAC
- [x] AAC files still work
- [x] Can add multiple library sources
- [x] Toggle sources on/off works
- [x] Remove sources works
- [x] Rename sources works
- [x] Library stats update correctly
- [x] Migration from old system works

## Breaking Changes
None - existing users will have their music folder automatically migrated to the new system.

## Migration
The first time users run this version, their existing music folder (if any) will be automatically migrated to a library source called "Main Library". No user action required.

## Performance Impact
- Queries now join with librarySources table to filter by enabled sources
- Minimal performance impact due to indexed columns
- Library scanning performance unchanged

## Future Enhancements
- Network source support
- Source-specific scanning schedules
- Import/export library sources configuration