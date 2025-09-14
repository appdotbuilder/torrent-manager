import { db } from '../db';
import { torrentsTable, torrentFilesTable, usersTable } from '../db/schema';
import { type CreateTorrentFromFileInput, type Torrent } from '../schema';
import { eq } from 'drizzle-orm';
import { createHash } from 'crypto';

// Simple torrent file parser for .torrent files
interface ParsedTorrentFile {
  infoHash: string;
  name: string;
  totalSize: number;
  files: Array<{
    path: string;
    length: number;
  }>;
}

// Basic bencode decoder for torrent files
function decodeBencode(data: Buffer): any {
  let index = 0;
  
  function decode(): any {
    const char = String.fromCharCode(data[index]);
    
    if (char >= '0' && char <= '9') {
      // String: length:string
      let lengthStr = '';
      while (index < data.length && String.fromCharCode(data[index]) !== ':') {
        lengthStr += String.fromCharCode(data[index]);
        index++;
      }
      index++; // Skip ':'
      const length = parseInt(lengthStr);
      const result = data.slice(index, index + length).toString('binary');
      index += length;
      return result;
    }
    
    if (char === 'i') {
      // Integer: iNNe
      index++;
      let numStr = '';
      while (index < data.length && String.fromCharCode(data[index]) !== 'e') {
        numStr += String.fromCharCode(data[index]);
        index++;
      }
      index++; // Skip 'e'
      return parseInt(numStr);
    }
    
    if (char === 'l') {
      // List: l...e
      index++;
      const result = [];
      while (index < data.length && String.fromCharCode(data[index]) !== 'e') {
        result.push(decode());
      }
      index++; // Skip 'e'
      return result;
    }
    
    if (char === 'd') {
      // Dictionary: d...e
      index++;
      const result: any = {};
      while (index < data.length && String.fromCharCode(data[index]) !== 'e') {
        const key = decode();
        const value = decode();
        result[key] = value;
      }
      index++; // Skip 'e'
      return result;
    }
    
    throw new Error('Invalid bencode data');
  }
  
  return decode();
}

function parseTorrentFile(torrentData: Buffer): ParsedTorrentFile {
  try {
    const decoded = decodeBencode(torrentData);
    
    if (!decoded.info) {
      throw new Error('Invalid torrent file: missing info section');
    }
    
    const info = decoded.info;
    
    // Calculate info hash
    const infoStart = torrentData.indexOf('4:info') + 6; // Skip '4:info'
    let infoEnd = torrentData.length - 1; // Find the end of info dict
    
    // Simple approach: find the last 'e' that closes the info dict
    let braceCount = 0;
    let i = infoStart;
    
    while (i < torrentData.length) {
      const char = String.fromCharCode(torrentData[i]);
      if (char === 'd' || char === 'l') braceCount++;
      else if (char === 'e') {
        braceCount--;
        if (braceCount === 0) {
          infoEnd = i + 1;
          break;
        }
      }
      i++;
    }
    
    const infoBuffer = torrentData.slice(infoStart - 1, infoEnd); // Include the 'd' at start
    const infoHash = createHash('sha1').update(infoBuffer).digest('hex');
    
    const name = info.name || 'Unknown Torrent';
    let totalSize = 0;
    const files: Array<{ path: string; length: number }> = [];
    
    if (info.files) {
      // Multi-file torrent
      for (const file of info.files) {
        const filePath = Array.isArray(file.path) ? file.path.join('/') : 'unknown';
        const fileLength = file.length || 0;
        files.push({ path: filePath, length: fileLength });
        totalSize += fileLength;
      }
    } else {
      // Single-file torrent
      const fileLength = info.length || 0;
      files.push({ path: name, length: fileLength });
      totalSize = fileLength;
    }
    
    return {
      infoHash,
      name,
      totalSize,
      files
    };
  } catch (error) {
    throw new Error(`Failed to parse torrent file: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

export async function createTorrentFromFile(
  input: CreateTorrentFromFileInput,
  userId: string
): Promise<Torrent> {
  try {
    // Verify user exists
    const user = await db.select()
      .from(usersTable)
      .where(eq(usersTable.id, userId))
      .execute();
    
    if (user.length === 0) {
      throw new Error('User not found');
    }
    
    // Decode base64 torrent file data
    let torrentBuffer: Buffer;
    try {
      torrentBuffer = Buffer.from(input.torrent_file_data, 'base64');
      // Validate that the decoded data is not empty and looks like binary data
      if (torrentBuffer.length === 0) {
        throw new Error('Empty torrent file data');
      }
      // Basic check for invalid base64 - if the original and re-encoded don't match closely
      const reencoded = torrentBuffer.toString('base64');
      if (Math.abs(reencoded.length - input.torrent_file_data.length) > 4) {
        throw new Error('Invalid base64 encoding');
      }
    } catch (error) {
      if (error instanceof Error && error.message.includes('Invalid base64')) {
        throw error;
      }
      throw new Error('Invalid base64 torrent file data');
    }
    
    // Parse torrent file
    const parsedTorrent = parseTorrentFile(torrentBuffer);
    
    // Check if torrent already exists for this user
    const existingTorrent = await db.select()
      .from(torrentsTable)
      .where(eq(torrentsTable.info_hash, parsedTorrent.infoHash))
      .execute();
    
    if (existingTorrent.length > 0) {
      throw new Error('Torrent with this info hash already exists');
    }
    
    // Generate unique ID for torrent
    const torrentId = `torrent_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    // Create torrent record
    const torrentResult = await db.insert(torrentsTable)
      .values({
        id: torrentId,
        user_id: userId,
        name: input.name,
        info_hash: parsedTorrent.infoHash,
        magnet_link: null,
        file_path: null,
        total_size: parsedTorrent.totalSize.toString(),
        downloaded_size: '0',
        progress: '0',
        download_speed: '0',
        upload_speed: '0',
        peers: 0,
        seeds: 0,
        status: 'downloading',
      })
      .returning()
      .execute();
    
    // Create torrent file records
    const torrentFileRecords = parsedTorrent.files.map(file => ({
      id: `file_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      torrent_id: torrentId,
      file_path: file.path,
      file_size: file.length.toString(),
      is_directory: false
    }));
    
    if (torrentFileRecords.length > 0) {
      await db.insert(torrentFilesTable)
        .values(torrentFileRecords)
        .execute();
    }
    
    // Convert numeric fields back to numbers
    const torrent = torrentResult[0];
    return {
      ...torrent,
      total_size: parseFloat(torrent.total_size),
      downloaded_size: parseFloat(torrent.downloaded_size),
      progress: parseFloat(torrent.progress),
      download_speed: parseFloat(torrent.download_speed),
      upload_speed: parseFloat(torrent.upload_speed)
    };
  } catch (error) {
    console.error('Torrent creation from file failed:', error);
    throw error;
  }
}