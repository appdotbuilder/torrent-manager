import { db } from '../db';
import { torrentsTable, torrentFilesTable } from '../db/schema';
import { type DownloadFileInput } from '../schema';
import { eq, and } from 'drizzle-orm';
import * as fs from 'fs/promises';
import * as path from 'path';


export interface FileDownloadResponse {
    fileBuffer: Buffer;
    fileName: string;
    mimeType: string;
}

// Simple mime type detection function
function getMimeType(fileName: string): string {
    const ext = path.extname(fileName).toLowerCase();
    const mimeTypes: Record<string, string> = {
        '.txt': 'text/plain',
        '.html': 'text/html',
        '.css': 'text/css',
        '.js': 'text/javascript',
        '.json': 'application/json',
        '.pdf': 'application/pdf',
        '.zip': 'application/zip',
        '.mp4': 'video/mp4',
        '.avi': 'video/x-msvideo',
        '.mkv': 'video/x-matroska',
        '.mp3': 'audio/mpeg',
        '.wav': 'audio/wav',
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.png': 'image/png',
        '.gif': 'image/gif',
        '.svg': 'image/svg+xml',
        '.srt': 'application/x-subrip',
        '.vtt': 'text/vtt',
    };
    
    return mimeTypes[ext] || 'application/octet-stream';
}

export async function downloadFile(
    input: DownloadFileInput,
    userId: string
): Promise<FileDownloadResponse | null> {
    try {
        // 1. Verify the torrent belongs to the requesting user and get torrent info
        const torrentResult = await db.select()
            .from(torrentsTable)
            .where(and(
                eq(torrentsTable.id, input.torrent_id),
                eq(torrentsTable.user_id, userId)
            ))
            .execute();

        if (torrentResult.length === 0) {
            return null; // Torrent not found or doesn't belong to user
        }

        const torrent = torrentResult[0];

        // 2. Check if the torrent is completed
        if (torrent.status !== 'completed') {
            return null; // Torrent is not completed yet
        }

        // 3. Validate that the requested file exists within the torrent
        const fileResult = await db.select()
            .from(torrentFilesTable)
            .where(and(
                eq(torrentFilesTable.torrent_id, input.torrent_id),
                eq(torrentFilesTable.file_path, input.file_path),
                eq(torrentFilesTable.is_directory, false) // Only allow downloading files, not directories
            ))
            .execute();

        if (fileResult.length === 0) {
            return null; // File not found in torrent or is a directory
        }

        const torrentFile = fileResult[0];

        // 4. Check if torrent has a file_path (where files are stored)
        if (!torrent.file_path) {
            return null; // No file path set for this torrent
        }

        // 5. Read the file from the file system
        const fullFilePath = path.join(torrent.file_path, input.file_path);
        
        // Security check: ensure the requested file is within the torrent directory
        const normalizedTorrentPath = path.normalize(torrent.file_path);
        const normalizedFullPath = path.normalize(fullFilePath);
        if (!normalizedFullPath.startsWith(normalizedTorrentPath)) {
            return null; // Path traversal attempt
        }

        try {
            const fileBuffer = await fs.readFile(fullFilePath);
            
            // 6. Determine file name and mime type
            const fileName = path.basename(input.file_path);
            const mimeType = getMimeType(fileName);

            return {
                fileBuffer,
                fileName,
                mimeType
            };
        } catch (fileError) {
            // File doesn't exist on disk or can't be read
            console.error('File read failed:', fileError);
            return null;
        }
    } catch (error) {
        console.error('Download file failed:', error);
        throw error;
    }
}