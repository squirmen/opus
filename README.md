# Opus

**A beautiful music player for audiophiles.**

Opus is a community-maintained fork of [Wora](https://github.com/hiaaryan/wora), continuing active development of the current codebase with enhanced features and improvements.

## Why Opus?

The original Wora project is being rewritten in Rust. Opus continues development on the proven Electron/Next.js stack with a focus on:

- Active maintenance and bug fixes
- Community-driven feature development
- Preserving existing workflows and extensions

## Enhanced Features

Beyond the original Wora feature set, Opus includes:

- **Artist Pages** - Dedicated artist views with virtualized performance
- **Crossfade & Gapless Playback** - Web Audio API implementation with audiophile-grade transitions
- **Multi-Library Support** - Manage multiple music library locations
- **ALAC/M4A Support** - Full codec detection and playback for Apple Lossless
- **Lossless Indicators** - Visual feedback for audio quality
- **Volume Normalization** - Consistent playback levels across tracks
- **UI Enhancements** - Improved performance and user experience throughout

## Core Features (from Wora)

- Create and manage playlists
- Stream FLAC, WAV, ALAC, MP3, and more
- Quick play using command menu
- View synced and unsynced lyrics
- Beautiful, minimal UI

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) v14 or higher
- [Yarn](https://yarnpkg.com/) (project uses Yarn)

### Installation

1. **Clone the repository:**

   ```sh
   git clone https://github.com/squirmen/wora.git
   cd wora
   ```

2. **Install dependencies:**

   ```sh
   yarn install
   ```

3. **Start the application:**

   ```sh
   yarn dev
   ```

4. **Build the application:**

   ```sh
   yarn build
   ```

   Platform-specific builds:
   ```sh
   yarn build:mac      # macOS Universal
   yarn build:linux    # Linux
   yarn build:win64    # Windows x64
   ```

## Contributing

Contributions are welcome! Please:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature-name`)
3. Commit your changes
4. Push to the branch
5. Create a Pull Request

## Credits

Opus is built on the foundation of [Wora](https://github.com/hiaaryan/wora) by [Aaryan Kapoor](https://github.com/hiaaryan) and contributors.

## License

MIT License - see [LICENSE](LICENSE) file for details.

Original work Copyright (c) 2024 Wora
Modified work Copyright (c) 2025 Tim Welch
