import { pgTable, text, timestamp, numeric, integer, boolean, pgEnum } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

// Enum for torrent status
export const torrentStatusEnum = pgEnum('torrent_status', [
  'downloading',
  'completed',
  'paused',
  'error',
  'seeding'
]);

// Users table for authentication
export const usersTable = pgTable('users', {
  id: text('id').primaryKey(),
  email: text('email').notNull().unique(),
  name: text('name').notNull(),
  password_hash: text('password_hash').notNull(),
  created_at: timestamp('created_at').defaultNow().notNull(),
  updated_at: timestamp('updated_at').defaultNow().notNull(),
});

// Sessions table for BetterAuth
export const sessionsTable = pgTable('sessions', {
  id: text('id').primaryKey(),
  user_id: text('user_id').notNull().references(() => usersTable.id, { onDelete: 'cascade' }),
  expires_at: timestamp('expires_at').notNull(),
  created_at: timestamp('created_at').defaultNow().notNull(),
});

// Torrents table
export const torrentsTable = pgTable('torrents', {
  id: text('id').primaryKey(),
  user_id: text('user_id').notNull().references(() => usersTable.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  info_hash: text('info_hash').notNull().unique(),
  magnet_link: text('magnet_link'), // Nullable - not all torrents come from magnet links
  file_path: text('file_path'), // Nullable - path to downloaded files
  total_size: numeric('total_size', { precision: 20, scale: 0 }).notNull(), // Use numeric for large file sizes
  downloaded_size: numeric('downloaded_size', { precision: 20, scale: 0 }).notNull().default('0'),
  progress: numeric('progress', { precision: 5, scale: 2 }).notNull().default('0'), // Progress as percentage (0.00-100.00)
  download_speed: numeric('download_speed', { precision: 15, scale: 2 }).notNull().default('0'), // Bytes per second
  upload_speed: numeric('upload_speed', { precision: 15, scale: 2 }).notNull().default('0'), // Bytes per second
  peers: integer('peers').notNull().default(0),
  seeds: integer('seeds').notNull().default(0),
  status: torrentStatusEnum('status').notNull().default('downloading'),
  created_at: timestamp('created_at').defaultNow().notNull(),
  updated_at: timestamp('updated_at').defaultNow().notNull(),
  completed_at: timestamp('completed_at'), // Nullable - set when torrent completes
});

// Torrent files table - tracks individual files within a torrent
export const torrentFilesTable = pgTable('torrent_files', {
  id: text('id').primaryKey(),
  torrent_id: text('torrent_id').notNull().references(() => torrentsTable.id, { onDelete: 'cascade' }),
  file_path: text('file_path').notNull(), // Relative path within torrent
  file_size: numeric('file_size', { precision: 20, scale: 0 }).notNull(),
  is_directory: boolean('is_directory').notNull().default(false),
  created_at: timestamp('created_at').defaultNow().notNull(),
});

// Relations
export const usersRelations = relations(usersTable, ({ many }) => ({
  sessions: many(sessionsTable),
  torrents: many(torrentsTable),
}));

export const sessionsRelations = relations(sessionsTable, ({ one }) => ({
  user: one(usersTable, {
    fields: [sessionsTable.user_id],
    references: [usersTable.id],
  }),
}));

export const torrentsRelations = relations(torrentsTable, ({ one, many }) => ({
  user: one(usersTable, {
    fields: [torrentsTable.user_id],
    references: [usersTable.id],
  }),
  files: many(torrentFilesTable),
}));

export const torrentFilesRelations = relations(torrentFilesTable, ({ one }) => ({
  torrent: one(torrentsTable, {
    fields: [torrentFilesTable.torrent_id],
    references: [torrentsTable.id],
  }),
}));

// TypeScript types for the table schemas
export type User = typeof usersTable.$inferSelect;
export type NewUser = typeof usersTable.$inferInsert;
export type Session = typeof sessionsTable.$inferSelect;
export type NewSession = typeof sessionsTable.$inferInsert;
export type Torrent = typeof torrentsTable.$inferSelect;
export type NewTorrent = typeof torrentsTable.$inferInsert;
export type TorrentFile = typeof torrentFilesTable.$inferSelect;
export type NewTorrentFile = typeof torrentFilesTable.$inferInsert;

// Export all tables and relations for proper query building
export const tables = {
  users: usersTable,
  sessions: sessionsTable,
  torrents: torrentsTable,
  torrentFiles: torrentFilesTable,
};

export const tableRelations = {
  usersRelations,
  sessionsRelations,
  torrentsRelations,
  torrentFilesRelations,
};