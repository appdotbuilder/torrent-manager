import { db } from '../db';
import { torrentsTable } from '../db/schema';
import { type CreateTorrentFromMagnetInput, type Torrent } from '../schema';
import { eq, and } from 'drizzle-orm';
import { nanoid } from 'nanoid';

// Helper function to parse magnet link and extract info hash and name
function parseMagnetLink(magnetLink: string): { infoHash: string; name?: string } {
  try {
    const url = new URL(magnetLink);
    
    if (url.protocol !== 'magnet:') {
      throw new Error('Invalid magnet link protocol');
    }

    const params = new URLSearchParams(url.searchParams);
    
    // Extract info hash from xt parameter
    const xt = params.get('xt');
    if (!xt || !xt.startsWith('urn:btih:')) {
      throw new Error('Invalid or missing info hash in magnet link');
    }
    
    const infoHash = xt.replace('urn:btih:', '').toLowerCase();
    
    // Validate info hash format (should be 40 hex characters)
    if (!/^[a-f0-9]{40}$/i.test(infoHash)) {
      throw new Error('Invalid info hash format');
    }

    // Extract display name if available
    const name = params.get('dn');
    
    return {
      infoHash: infoHash.toLowerCase(),
      name: name ? decodeURIComponent(name) : undefined
    };
  } catch (error) {
    if (error instanceof Error) {
      throw error;
    }
    throw new Error('Failed to parse magnet link');
  }
}

export async function createTorrentFromMagnet(
  input: CreateTorrentFromMagnetInput,
  userId: string
): Promise<Torrent> {
  try {
    // Parse magnet link to extract info hash and name
    const { infoHash, name: extractedName } = parseMagnetLink(input.magnet_link);
    
    // Use provided name or fall back to extracted name or default
    const torrentName = input.name || extractedName || `Torrent ${infoHash.substring(0, 8)}`;

    // Check if torrent with same info hash already exists (globally unique)
    const existingTorrents = await db.select()
      .from(torrentsTable)
      .where(eq(torrentsTable.info_hash, infoHash))
      .execute();

    if (existingTorrents.length > 0) {
      throw new Error('Torrent with this info hash already exists');
    }

    // Create new torrent record
    const torrentId = nanoid();
    const result = await db.insert(torrentsTable)
      .values({
        id: torrentId,
        user_id: userId,
        name: torrentName,
        info_hash: infoHash,
        magnet_link: input.magnet_link,
        file_path: null,
        total_size: '0', // Convert to string for numeric column
        downloaded_size: '0',
        progress: '0.00',
        download_speed: '0.00',
        upload_speed: '0.00',
        peers: 0,
        seeds: 0,
        status: 'downloading'
      })
      .returning()
      .execute();

    // Convert numeric fields back to numbers before returning
    const torrent = result[0];
    return {
      ...torrent,
      total_size: parseFloat(torrent.total_size),
      downloaded_size: parseFloat(torrent.downloaded_size),
      progress: parseFloat(torrent.progress),
      download_speed: parseFloat(torrent.download_speed),
      upload_speed: parseFloat(torrent.upload_speed)
    };
  } catch (error) {
    console.error('Torrent creation from magnet failed:', error);
    throw error;
  }
}