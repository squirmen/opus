import React, { memo } from 'react';
import { FixedSizeGrid as Grid } from 'react-window';
import AutoSizer from 'react-virtualized-auto-sizer';
import Image from 'next/image';
import { IconUser } from '@tabler/icons-react';

interface ArtistItem {
  name: string;
  albumCount: number;
  songCount: number;
  cover?: string;
}

interface VirtualArtistGridProps {
  artists: ArtistItem[];
  viewMode: 'grid-large' | 'grid-small' | 'list';
  onArtistClick: (artistName: string) => void;
}

const getColumnCount = (width: number, viewMode: string): number => {
  if (viewMode === 'list') return 1;
  
  const minWidth = viewMode === 'grid-large' ? 200 : 120;
  return Math.floor(width / minWidth) || 1;
};

const getRowHeight = (viewMode: string): number => {
  switch (viewMode) {
    case 'grid-large': return 260;
    case 'grid-small': return 160;
    case 'list': return 72;
    default: return 260;
  }
};

const ArtistCell = memo(({ 
  data, 
  columnIndex, 
  rowIndex, 
  style 
}: {
  data: any;
  columnIndex: number;
  rowIndex: number;
  style: React.CSSProperties;
}) => {
  const { artists, columnCount, viewMode, onArtistClick } = data;
  const index = rowIndex * columnCount + columnIndex;
  const artist = artists[index];
  
  if (!artist) return null;
  
  const cellStyle = {
    ...style,
    padding: viewMode === 'list' ? '4px 8px' : '8px',
  };
  
  if (viewMode === 'list') {
    return (
      <div style={cellStyle}>
        <div
          className="group flex cursor-pointer items-center gap-4 rounded-lg p-3 transition hover:bg-gray-100 dark:hover:bg-gray-800"
          onClick={() => onArtistClick(artist.name)}
        >
          <div className="relative h-12 w-12 flex-shrink-0 overflow-hidden rounded-lg bg-gradient-to-br from-gray-100 to-gray-200 dark:from-gray-800 dark:to-gray-900">
            {artist.cover ? (
              <Image
                alt={artist.name}
                src={`wora://${artist.cover}`}
                fill
                loading="lazy"
                className="object-cover"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center">
                <IconUser stroke={1.5} size={20} className="opacity-50" />
              </div>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <p className="truncate font-medium">{artist.name}</p>
            <p className="text-sm opacity-60">
              {artist.albumCount} {artist.albumCount === 1 ? "album" : "albums"} · {artist.songCount} {artist.songCount === 1 ? "song" : "songs"}
            </p>
          </div>
        </div>
      </div>
    );
  }
  
  const isLarge = viewMode === 'grid-large';
  
  return (
    <div style={cellStyle}>
      <div
        className="group cursor-pointer h-full"
        onClick={() => onArtistClick(artist.name)}
      >
        <div className={`relative aspect-square overflow-hidden ${isLarge ? 'rounded-xl' : 'rounded-lg'} bg-gradient-to-br from-gray-100 to-gray-200 shadow${isLarge ? '-lg' : ''} transition duration-300 group-hover:scale-[1.02] group-hover:shadow-xl dark:from-gray-800 dark:to-gray-900`}>
          {artist.cover ? (
            <Image
              alt={artist.name}
              src={`wora://${artist.cover}`}
              fill
              loading="lazy"
              className="object-cover"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center">
              <IconUser stroke={1.5} size={isLarge ? 48 : 32} className="opacity-50" />
            </div>
          )}
        </div>
        <div className={isLarge ? 'mt-3' : 'mt-2'}>
          <p className={`truncate ${isLarge ? 'font-medium' : 'text-xs font-medium'}`}>{artist.name}</p>
          <p className={`${isLarge ? 'text-xs' : 'truncate text-xs'} opacity-60`}>
            {isLarge 
              ? `${artist.albumCount} ${artist.albumCount === 1 ? "album" : "albums"} · ${artist.songCount} ${artist.songCount === 1 ? "song" : "songs"}`
              : `${artist.songCount} songs`
            }
          </p>
        </div>
      </div>
    </div>
  );
});

ArtistCell.displayName = 'ArtistCell';

export default function VirtualArtistGrid({ 
  artists, 
  viewMode, 
  onArtistClick 
}: VirtualArtistGridProps) {
  return (
    <div className="h-[calc(100vh-300px)] w-full">
      <AutoSizer>
        {({ height, width }) => {
          const columnCount = getColumnCount(width, viewMode);
          const rowCount = Math.ceil(artists.length / columnCount);
          const rowHeight = getRowHeight(viewMode);
          const columnWidth = width / columnCount;
          
          return (
            <Grid
              columnCount={columnCount}
              columnWidth={columnWidth}
              height={height}
              rowCount={rowCount}
              rowHeight={rowHeight}
              width={width}
              itemData={{
                artists,
                columnCount,
                viewMode,
                onArtistClick,
              }}
            >
              {ArtistCell}
            </Grid>
          );
        }}
      </AutoSizer>
    </div>
  );
}