import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { resetDB, createDB } from '../helpers';
import { db } from '../db';
import { usersTable, torrentsTable, torrentFilesTable } from '../db/schema';
import { type CreateTorrentFromFileInput } from '../schema';
import { createTorrentFromFile } from '../handlers/create_torrent_from_file';
import { eq } from 'drizzle-orm';

// Create a simple torrent file for testing (single file)
function createTestTorrentFile(name: string, fileSize: number): string {
  // This creates a minimal valid torrent file in bencoded format
  const announce = 'http://test-tracker.example.com/announce';
  
  // Manual bencode encoding for test data
  function bencode(obj: any): string {
    if (typeof obj === 'string') {
      return `${obj.length}:${obj}`;
    } else if (typeof obj === 'number') {
      return `i${obj}e`;
    } else if (obj instanceof Uint8Array) {
      return `${obj.length}:${Array.from(obj).map(b => String.fromCharCode(b)).join('')}`;
    } else if (Array.isArray(obj)) {
      return `l${obj.map(bencode).join('')}e`;
    } else if (typeof obj === 'object' && obj !== null) {
      const keys = Object.keys(obj).sort();
      return `d${keys.map(key => bencode(key) + bencode(obj[key])).join('')}e`;
    }
    throw new Error('Unsupported type for bencode');
  }
  
  const info = {
    name: name,
    length: fileSize,
    'piece length': 32768,
    pieces: new Uint8Array(20) // Single piece hash (20 bytes)
  };
  
  const torrentData = {
    announce: announce,
    info: info
  };
  
  return Buffer.from(bencode(torrentData), 'binary').toString('base64');
}

// Create a multi-file torrent for testing
function createMultiFileTorrentFile(name: string, files: Array<{name: string, size: number}>): string {
  const announce = 'http://test-tracker.example.com/announce';
  const totalSize = files.reduce((sum, file) => sum + file.size, 0);
  const pieceLength = 32768;
  const numPieces = Math.ceil(totalSize / pieceLength);
  
  function bencode(obj: any): string {
    if (typeof obj === 'string') {
      return `${obj.length}:${obj}`;
    } else if (typeof obj === 'number') {
      return `i${obj}e`;
    } else if (obj instanceof Uint8Array) {
      return `${obj.length}:${Array.from(obj).map(b => String.fromCharCode(b)).join('')}`;
    } else if (Array.isArray(obj)) {
      return `l${obj.map(bencode).join('')}e`;
    } else if (typeof obj === 'object' && obj !== null) {
      const keys = Object.keys(obj).sort();
      return `d${keys.map(key => bencode(key) + bencode(obj[key])).join('')}e`;
    }
    throw new Error('Unsupported type for bencode');
  }
  
  const info = {
    name: name,
    files: files.map(file => ({
      length: file.size,
      path: [file.name]
    })),
    'piece length': pieceLength,
    pieces: new Uint8Array(numPieces * 20) // Multiple piece hashes
  };
  
  const torrentData = {
    announce: announce,
    info: info
  };
  
  return Buffer.from(bencode(torrentData), 'binary').toString('base64');
}

// Test user data
const testUserId = 'test_user_123';
const testUser = {
  id: testUserId,
  email: 'test@example.com',
  name: 'Test User',
  password_hash: 'hashed_password'
};

describe('createTorrentFromFile', () => {
  beforeEach(createDB);
  afterEach(resetDB);

  beforeEach(async () => {
    // Create test user
    await db.insert(usersTable).values(testUser).execute();
  });

  it('should create a single-file torrent', async () => {
    const torrentFileData = createTestTorrentFile('test-movie.mp4', 1073741824); // 1GB
    const input: CreateTorrentFromFileInput = {
      name: 'Test Movie',
      torrent_file_data: torrentFileData
    };

    const result = await createTorrentFromFile(input, testUserId);

    // Basic field validation
    expect(result.name).toEqual('Test Movie');
    expect(result.user_id).toEqual(testUserId);
    expect(result.total_size).toEqual(1073741824);
    expect(result.downloaded_size).toEqual(0);
    expect(result.progress).toEqual(0);
    expect(result.status).toEqual('downloading');
    expect(result.magnet_link).toBeNull();
    expect(result.file_path).toBeNull();
    expect(result.id).toBeDefined();
    expect(result.info_hash).toBeDefined();
    expect(result.created_at).toBeInstanceOf(Date);
    expect(result.updated_at).toBeInstanceOf(Date);
    expect(result.completed_at).toBeNull();

    // Verify numeric types
    expect(typeof result.total_size).toBe('number');
    expect(typeof result.downloaded_size).toBe('number');
    expect(typeof result.progress).toBe('number');
    expect(typeof result.download_speed).toBe('number');
    expect(typeof result.upload_speed).toBe('number');
  });

  it('should create a multi-file torrent', async () => {
    const files = [
      { name: 'movie.mp4', size: 1000000000 },
      { name: 'subtitles.srt', size: 50000 },
      { name: 'readme.txt', size: 1500 }
    ];
    const torrentFileData = createMultiFileTorrentFile('Movie Collection', files);
    const input: CreateTorrentFromFileInput = {
      name: 'Movie Collection',
      torrent_file_data: torrentFileData
    };

    const result = await createTorrentFromFile(input, testUserId);

    expect(result.name).toEqual('Movie Collection');
    expect(result.total_size).toEqual(1000051500); // Sum of all file sizes
    expect(result.status).toEqual('downloading');
  });

  it('should save torrent to database', async () => {
    const torrentFileData = createTestTorrentFile('test-file.dat', 2048);
    const input: CreateTorrentFromFileInput = {
      name: 'Test Data',
      torrent_file_data: torrentFileData
    };

    const result = await createTorrentFromFile(input, testUserId);

    // Query database to verify torrent was saved
    const torrents = await db.select()
      .from(torrentsTable)
      .where(eq(torrentsTable.id, result.id))
      .execute();

    expect(torrents).toHaveLength(1);
    const savedTorrent = torrents[0];
    expect(savedTorrent.name).toEqual('Test Data');
    expect(savedTorrent.user_id).toEqual(testUserId);
    expect(parseFloat(savedTorrent.total_size)).toEqual(2048);
    expect(savedTorrent.status).toEqual('downloading');
  });

  it('should create torrent file records', async () => {
    const files = [
      { name: 'file1.txt', size: 1000 },
      { name: 'file2.txt', size: 2000 }
    ];
    const torrentFileData = createMultiFileTorrentFile('Test Files', files);
    const input: CreateTorrentFromFileInput = {
      name: 'Test Files',
      torrent_file_data: torrentFileData
    };

    const result = await createTorrentFromFile(input, testUserId);

    // Query torrent files
    const torrentFiles = await db.select()
      .from(torrentFilesTable)
      .where(eq(torrentFilesTable.torrent_id, result.id))
      .execute();

    expect(torrentFiles).toHaveLength(2);
    
    const file1 = torrentFiles.find(f => f.file_path === 'file1.txt');
    const file2 = torrentFiles.find(f => f.file_path === 'file2.txt');
    
    expect(file1).toBeDefined();
    expect(file2).toBeDefined();
    expect(parseFloat(file1!.file_size)).toEqual(1000);
    expect(parseFloat(file2!.file_size)).toEqual(2000);
    expect(file1!.is_directory).toBe(false);
    expect(file2!.is_directory).toBe(false);
  });

  it('should reject invalid base64 data', async () => {
    const input: CreateTorrentFromFileInput = {
      name: 'Invalid Torrent',
      torrent_file_data: '!@#$%^&*()' // Invalid base64 characters
    };

    await expect(createTorrentFromFile(input, testUserId))
      .rejects.toThrow(/invalid base64/i);
  });

  it('should reject invalid torrent file format', async () => {
    const invalidTorrentData = Buffer.from('not a torrent file').toString('base64');
    const input: CreateTorrentFromFileInput = {
      name: 'Invalid Torrent',
      torrent_file_data: invalidTorrentData
    };

    await expect(createTorrentFromFile(input, testUserId))
      .rejects.toThrow(/failed to parse torrent file/i);
  });

  it('should reject torrent with duplicate info hash', async () => {
    const torrentFileData = createTestTorrentFile('duplicate.mp4', 1024);
    const input: CreateTorrentFromFileInput = {
      name: 'First Torrent',
      torrent_file_data: torrentFileData
    };

    // Create first torrent
    await createTorrentFromFile(input, testUserId);

    // Try to create duplicate
    const duplicateInput: CreateTorrentFromFileInput = {
      name: 'Duplicate Torrent',
      torrent_file_data: torrentFileData
    };

    await expect(createTorrentFromFile(duplicateInput, testUserId))
      .rejects.toThrow(/torrent with this info hash already exists/i);
  });

  it('should reject non-existent user', async () => {
    const torrentFileData = createTestTorrentFile('test.mp4', 1024);
    const input: CreateTorrentFromFileInput = {
      name: 'Test Torrent',
      torrent_file_data: torrentFileData
    };

    await expect(createTorrentFromFile(input, 'non_existent_user'))
      .rejects.toThrow(/user not found/i);
  });

  it('should generate consistent info hash for identical torrent files', async () => {
    const torrentFileData = createTestTorrentFile('consistent.mp4', 2048);
    const input1: CreateTorrentFromFileInput = {
      name: 'Torrent A',
      torrent_file_data: torrentFileData
    };

    const result1 = await createTorrentFromFile(input1, testUserId);
    
    // Create another user
    const testUser2 = {
      id: 'test_user_456',
      email: 'test2@example.com',
      name: 'Test User 2',
      password_hash: 'hashed_password'
    };
    await db.insert(usersTable).values(testUser2).execute();
    
    // Same torrent file should have same info hash but be rejected due to duplicate
    const input2: CreateTorrentFromFileInput = {
      name: 'Torrent B',
      torrent_file_data: torrentFileData
    };

    await expect(createTorrentFromFile(input2, testUser2.id))
      .rejects.toThrow(/torrent with this info hash already exists/i);
      
    // Verify the info hash would be the same by checking the first torrent
    expect(result1.info_hash).toBeDefined();
    expect(result1.info_hash.length).toEqual(40); // SHA1 hex string length
  });
});