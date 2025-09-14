import { z } from 'zod';

// User schema
export const userSchema = z.object({
  id: z.string(),
  email: z.string().email(),
  name: z.string(),
  created_at: z.coerce.date(),
  updated_at: z.coerce.date(),
});

export type User = z.infer<typeof userSchema>;

// Session schema for BetterAuth
export const sessionSchema = z.object({
  id: z.string(),
  user_id: z.string(),
  expires_at: z.coerce.date(),
  created_at: z.coerce.date(),
});

export type Session = z.infer<typeof sessionSchema>;

// Torrent status enum
export const torrentStatusSchema = z.enum([
  'downloading',
  'completed',
  'paused',
  'error',
  'seeding'
]);

export type TorrentStatus = z.infer<typeof torrentStatusSchema>;

// Torrent schema
export const torrentSchema = z.object({
  id: z.string(),
  user_id: z.string(),
  name: z.string(),
  info_hash: z.string(),
  magnet_link: z.string().nullable(),
  file_path: z.string().nullable(),
  total_size: z.number(),
  downloaded_size: z.number(),
  progress: z.number().min(0).max(100),
  download_speed: z.number(),
  upload_speed: z.number(),
  peers: z.number().int(),
  seeds: z.number().int(),
  status: torrentStatusSchema,
  created_at: z.coerce.date(),
  updated_at: z.coerce.date(),
  completed_at: z.coerce.date().nullable(),
});

export type Torrent = z.infer<typeof torrentSchema>;

// Input schemas for creating torrents
export const createTorrentFromMagnetInputSchema = z.object({
  magnet_link: z.string().url(),
  name: z.string().optional(), // Will be extracted from magnet if not provided
});

export type CreateTorrentFromMagnetInput = z.infer<typeof createTorrentFromMagnetInputSchema>;

export const createTorrentFromFileInputSchema = z.object({
  name: z.string(),
  torrent_file_data: z.string(), // Base64 encoded torrent file
});

export type CreateTorrentFromFileInput = z.infer<typeof createTorrentFromFileInputSchema>;

// Input schema for updating torrent status
export const updateTorrentStatusInputSchema = z.object({
  torrent_id: z.string(),
  status: torrentStatusSchema,
  downloaded_size: z.number().optional(),
  progress: z.number().min(0).max(100).optional(),
  download_speed: z.number().optional(),
  upload_speed: z.number().optional(),
  peers: z.number().int().optional(),
  seeds: z.number().int().optional(),
});

export type UpdateTorrentStatusInput = z.infer<typeof updateTorrentStatusInputSchema>;

// Auth input schemas
export const registerInputSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  name: z.string().min(1),
});

export type RegisterInput = z.infer<typeof registerInputSchema>;

export const loginInputSchema = z.object({
  email: z.string().email(),
  password: z.string(),
});

export type LoginInput = z.infer<typeof loginInputSchema>;

// File download schema
export const downloadFileInputSchema = z.object({
  torrent_id: z.string(),
  file_path: z.string(), // Relative path within torrent
});

export type DownloadFileInput = z.infer<typeof downloadFileInputSchema>;

// Torrent file info schema
export const torrentFileSchema = z.object({
  id: z.string(),
  torrent_id: z.string(),
  file_path: z.string(),
  file_size: z.number(),
  is_directory: z.boolean(),
  created_at: z.coerce.date(),
});

export type TorrentFile = z.infer<typeof torrentFileSchema>;