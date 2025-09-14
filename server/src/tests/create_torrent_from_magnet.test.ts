import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { resetDB, createDB } from '../helpers';
import { db } from '../db';
import { torrentsTable, usersTable } from '../db/schema';
import { type CreateTorrentFromMagnetInput } from '../schema';
import { createTorrentFromMagnet } from '../handlers/create_torrent_from_magnet';
import { eq, and } from 'drizzle-orm';
import { nanoid } from 'nanoid';

// Test user
const testUserId = 'test-user-123';
const testUser = {
  id: testUserId,
  email: 'test@example.com',
  name: 'Test User',
  password_hash: 'hashed-password'
};

// Valid magnet link with name
const validMagnetWithName: CreateTorrentFromMagnetInput = {
  magnet_link: 'magnet:?xt=urn:btih:1234567890abcdef1234567890abcdef12345678&dn=Test%20Movie&tr=http://tracker.example.com/announce'
};

// Valid magnet link without name
const validMagnetWithoutName: CreateTorrentFromMagnetInput = {
  magnet_link: 'magnet:?xt=urn:btih:abcdef1234567890abcdef1234567890abcdef12&tr=http://tracker.example.com/announce'
};

// Magnet with custom name provided
const magnetWithCustomName: CreateTorrentFromMagnetInput = {
  magnet_link: 'magnet:?xt=urn:btih:fedcba0987654321fedcba0987654321fedcba09&dn=Original%20Name',
  name: 'Custom Name Override'
};

describe('createTorrentFromMagnet', () => {
  beforeEach(async () => {
    await createDB();
    // Create test user
    await db.insert(usersTable).values(testUser).execute();
  });

  afterEach(resetDB);

  it('should create torrent from magnet link with extracted name', async () => {
    const result = await createTorrentFromMagnet(validMagnetWithName, testUserId);

    // Verify basic fields
    expect(result.id).toBeDefined();
    expect(result.user_id).toEqual(testUserId);
    expect(result.name).toEqual('Test Movie');
    expect(result.info_hash).toEqual('1234567890abcdef1234567890abcdef12345678');
    expect(result.magnet_link).toEqual(validMagnetWithName.magnet_link);
    expect(result.status).toEqual('downloading');
    expect(result.file_path).toBeNull();
    expect(result.completed_at).toBeNull();
    expect(result.created_at).toBeInstanceOf(Date);
    expect(result.updated_at).toBeInstanceOf(Date);

    // Verify numeric fields are properly converted
    expect(typeof result.total_size).toBe('number');
    expect(typeof result.downloaded_size).toBe('number');
    expect(typeof result.progress).toBe('number');
    expect(typeof result.download_speed).toBe('number');
    expect(typeof result.upload_speed).toBe('number');
    expect(result.total_size).toEqual(0);
    expect(result.downloaded_size).toEqual(0);
    expect(result.progress).toEqual(0);
    expect(result.peers).toEqual(0);
    expect(result.seeds).toEqual(0);
  });

  it('should create torrent from magnet link without name and generate default', async () => {
    const result = await createTorrentFromMagnet(validMagnetWithoutName, testUserId);

    expect(result.name).toEqual('Torrent abcdef12');
    expect(result.info_hash).toEqual('abcdef1234567890abcdef1234567890abcdef12');
    expect(result.user_id).toEqual(testUserId);
    expect(result.status).toEqual('downloading');
  });

  it('should use custom name when provided', async () => {
    const result = await createTorrentFromMagnet(magnetWithCustomName, testUserId);

    expect(result.name).toEqual('Custom Name Override');
    expect(result.info_hash).toEqual('fedcba0987654321fedcba0987654321fedcba09');
    expect(result.user_id).toEqual(testUserId);
  });

  it('should save torrent to database correctly', async () => {
    const result = await createTorrentFromMagnet(validMagnetWithName, testUserId);

    // Query database to verify record was saved
    const torrents = await db.select()
      .from(torrentsTable)
      .where(eq(torrentsTable.id, result.id))
      .execute();

    expect(torrents).toHaveLength(1);
    const savedTorrent = torrents[0];
    
    expect(savedTorrent.name).toEqual('Test Movie');
    expect(savedTorrent.user_id).toEqual(testUserId);
    expect(savedTorrent.info_hash).toEqual('1234567890abcdef1234567890abcdef12345678');
    expect(savedTorrent.magnet_link).toEqual(validMagnetWithName.magnet_link);
    expect(savedTorrent.status).toEqual('downloading');
    
    // Verify numeric fields stored as strings in database
    expect(savedTorrent.total_size).toEqual('0');
    expect(savedTorrent.downloaded_size).toEqual('0');
    expect(savedTorrent.progress).toEqual('0.00');
    expect(savedTorrent.download_speed).toEqual('0.00');
    expect(savedTorrent.upload_speed).toEqual('0.00');
  });

  it('should prevent duplicate torrents with same info hash', async () => {
    // Create first torrent
    await createTorrentFromMagnet(validMagnetWithName, testUserId);

    // Attempt to create duplicate torrent
    await expect(
      createTorrentFromMagnet(validMagnetWithName, testUserId)
    ).rejects.toThrow(/already exists/i);
  });

  it('should prevent same torrent from being added by different users', async () => {
    const secondUserId = 'test-user-456';
    const secondUser = {
      id: secondUserId,
      email: 'test2@example.com',
      name: 'Test User 2',
      password_hash: 'hashed-password-2'
    };

    // Create second user
    await db.insert(usersTable).values(secondUser).execute();

    // Create torrent for first user
    await createTorrentFromMagnet(validMagnetWithName, testUserId);
    
    // Attempt to create same torrent for second user - should fail due to unique info_hash constraint
    await expect(
      createTorrentFromMagnet(validMagnetWithName, secondUserId)
    ).rejects.toThrow(/already exists/i);
  });

  it('should reject invalid magnet link protocol', async () => {
    const invalidInput: CreateTorrentFromMagnetInput = {
      magnet_link: 'http://example.com/not-a-magnet-link'
    };

    await expect(
      createTorrentFromMagnet(invalidInput, testUserId)
    ).rejects.toThrow(/invalid magnet link protocol/i);
  });

  it('should reject magnet link without info hash', async () => {
    const invalidInput: CreateTorrentFromMagnetInput = {
      magnet_link: 'magnet:?tr=http://tracker.example.com/announce'
    };

    await expect(
      createTorrentFromMagnet(invalidInput, testUserId)
    ).rejects.toThrow(/invalid or missing info hash/i);
  });

  it('should reject magnet link with invalid info hash format', async () => {
    const invalidInput: CreateTorrentFromMagnetInput = {
      magnet_link: 'magnet:?xt=urn:btih:invalidhash&tr=http://tracker.example.com/announce'
    };

    await expect(
      createTorrentFromMagnet(invalidInput, testUserId)
    ).rejects.toThrow(/invalid info hash format/i);
  });

  it('should handle malformed magnet URLs', async () => {
    const invalidInput: CreateTorrentFromMagnetInput = {
      magnet_link: 'magnet:invalid-url-format'
    };

    await expect(
      createTorrentFromMagnet(invalidInput, testUserId)
    ).rejects.toThrow(/invalid or missing info hash/i);
  });

  it('should normalize info hash to lowercase', async () => {
    const upperCaseInput: CreateTorrentFromMagnetInput = {
      magnet_link: 'magnet:?xt=urn:btih:ABCDEF1234567890ABCDEF1234567890ABCDEF12&dn=Test'
    };

    const result = await createTorrentFromMagnet(upperCaseInput, testUserId);
    
    expect(result.info_hash).toEqual('abcdef1234567890abcdef1234567890abcdef12');
  });

  it('should decode URL-encoded torrent names', async () => {
    const encodedNameInput: CreateTorrentFromMagnetInput = {
      magnet_link: 'magnet:?xt=urn:btih:1234567890abcdef1234567890abcdef12345678&dn=Test%20Movie%20%5B2024%5D%20%281080p%29'
    };

    const result = await createTorrentFromMagnet(encodedNameInput, testUserId);
    
    expect(result.name).toEqual('Test Movie [2024] (1080p)');
  });
});