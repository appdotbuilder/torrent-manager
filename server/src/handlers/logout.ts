import { db } from '../db';
import { sessionsTable } from '../db/schema';
import { eq } from 'drizzle-orm';

export interface LogoutInput {
  session_id: string;
}

export const logoutUser = async (input: LogoutInput): Promise<{ success: boolean }> => {
  try {
    // Delete the session from the database
    const result = await db.delete(sessionsTable)
      .where(eq(sessionsTable.id, input.session_id))
      .execute();

    // Return success regardless of whether session was found
    // This is intentional for security reasons - we don't want to reveal
    // whether a session ID exists or not
    return { success: true };
  } catch (error) {
    console.error('Logout failed:', error);
    throw error;
  }
};