import { initTRPC } from '@trpc/server';
import { createHTTPServer } from '@trpc/server/adapters/standalone';
import { z } from 'zod';
import 'dotenv/config';
import cors from 'cors';
import superjson from 'superjson';

// Import schemas
import {
  registerInputSchema,
  loginInputSchema,
  createTorrentFromMagnetInputSchema,
  createTorrentFromFileInputSchema,
  updateTorrentStatusInputSchema,
  downloadFileInputSchema,
} from './schema';

// Import handlers
import { registerUser } from './handlers/register';
import { loginUser } from './handlers/login';
import { logoutUser } from './handlers/logout';
import { createTorrentFromMagnet } from './handlers/create_torrent_from_magnet';
import { createTorrentFromFile } from './handlers/create_torrent_from_file';
import { getUserTorrents } from './handlers/get_user_torrents';
import { getTorrentDetails } from './handlers/get_torrent_details';
import { updateTorrentStatus } from './handlers/update_torrent_status';
import { downloadFile } from './handlers/download_file';
import { deleteTorrent } from './handlers/delete_torrent';
import { pauseTorrent } from './handlers/pause_torrent';
import { resumeTorrent } from './handlers/resume_torrent';
import { getSession } from './handlers/get_session';

const t = initTRPC.create({
  transformer: superjson,
});

const publicProcedure = t.procedure;
const router = t.router;

// Simple middleware to extract user from session (placeholder implementation)
const authenticatedProcedure = publicProcedure.use(async ({ next, input }) => {
  // This is a placeholder! Real implementation should:
  // 1. Extract session ID from request headers/cookies
  // 2. Validate session and get user ID
  // 3. Pass user ID to the next handler
  const userId = 'placeholder-user-id'; // This should come from session validation
  return next({
    ctx: { userId },
  });
});

const appRouter = router({
  // Health check endpoint
  healthcheck: publicProcedure.query(() => {
    return { status: 'ok', timestamp: new Date().toISOString() };
  }),

  // Authentication endpoints
  register: publicProcedure
    .input(registerInputSchema)
    .mutation(({ input }) => registerUser(input)),

  login: publicProcedure
    .input(loginInputSchema)
    .mutation(({ input }) => loginUser(input)),

  logout: authenticatedProcedure
    .input(z.object({ session_id: z.string() }))
    .mutation(({ input }) => logoutUser(input)),

  getSession: publicProcedure
    .input(z.object({ session_id: z.string() }))
    .query(({ input }) => getSession(input.session_id)),

  // Torrent management endpoints
  createTorrentFromMagnet: authenticatedProcedure
    .input(createTorrentFromMagnetInputSchema)
    .mutation(({ input, ctx }) => createTorrentFromMagnet(input, ctx.userId)),

  createTorrentFromFile: authenticatedProcedure
    .input(createTorrentFromFileInputSchema)
    .mutation(({ input, ctx }) => createTorrentFromFile(input, ctx.userId)),

  getUserTorrents: authenticatedProcedure
    .query(({ ctx }) => getUserTorrents(ctx.userId)),

  getTorrentDetails: authenticatedProcedure
    .input(z.object({ torrent_id: z.string() }))
    .query(({ input, ctx }) => getTorrentDetails(input.torrent_id, ctx.userId)),

  updateTorrentStatus: authenticatedProcedure
    .input(updateTorrentStatusInputSchema)
    .mutation(({ input, ctx }) => updateTorrentStatus(input, ctx.userId)),

  // File download endpoint
  downloadFile: authenticatedProcedure
    .input(downloadFileInputSchema)
    .mutation(({ input, ctx }) => downloadFile(input, ctx.userId)),

  // Torrent control endpoints
  deleteTorrent: authenticatedProcedure
    .input(z.object({ torrent_id: z.string() }))
    .mutation(({ input, ctx }) => deleteTorrent(input, ctx.userId)),

  pauseTorrent: authenticatedProcedure
    .input(z.object({ torrent_id: z.string() }))
    .mutation(({ input, ctx }) => pauseTorrent(input, ctx.userId)),

  resumeTorrent: authenticatedProcedure
    .input(z.object({ torrent_id: z.string() }))
    .mutation(({ input, ctx }) => resumeTorrent(input, ctx.userId)),
});

export type AppRouter = typeof appRouter;

async function start() {
  const port = process.env['SERVER_PORT'] || 2022;
  const server = createHTTPServer({
    middleware: (req, res, next) => {
      cors({
        origin: process.env['CLIENT_URL'] || 'http://localhost:3000',
        credentials: true,
      })(req, res, next);
    },
    router: appRouter,
    createContext() {
      return {};
    },
  });
  
  server.listen(port);
  console.log(`TRPC server listening at port: ${port}`);
  console.log(`Database URL: ${process.env['APP_DATABASE_URL'] ? 'Connected' : 'Not configured'}`);
}

start();