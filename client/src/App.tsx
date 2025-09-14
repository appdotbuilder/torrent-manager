import { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { trpc } from '@/utils/trpc';
import { TorrentCard } from '@/components/TorrentCard';
import { AddTorrentDialog } from '@/components/AddTorrentDialog';
import { TorrentStats } from '@/components/TorrentStats';
import type { Torrent, User, RegisterInput, LoginInput } from '../../server/src/schema';

interface AuthState {
  isAuthenticated: boolean;
  user: User | null;
  sessionId: string | null;
}

function App() {
  const [authState, setAuthState] = useState<AuthState>({
    isAuthenticated: false,
    user: null,
    sessionId: null
  });
  const [torrents, setTorrents] = useState<Torrent[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [authError, setAuthError] = useState<string>('');

  // Auth form states
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [authForm, setAuthForm] = useState({
    email: '',
    password: '',
    name: ''
  });

  // Check session on app load
  useEffect(() => {
    const sessionId = localStorage.getItem('sessionId');
    if (sessionId) {
      checkSession(sessionId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const checkSession = async (sessionId: string) => {
    try {
      const result = await trpc.getSession.query({ session_id: sessionId });
      if (result) {
        setAuthState({
          isAuthenticated: true,
          user: result.user,
          sessionId
        });
        loadTorrents();
      } else {
        localStorage.removeItem('sessionId');
      }
    } catch (error) {
      console.error('Session check failed:', error);
      localStorage.removeItem('sessionId');
    }
  };

  const loadTorrents = useCallback(async () => {
    if (!authState.isAuthenticated) return;
    
    try {
      const result = await trpc.getUserTorrents.query();
      setTorrents(result);
    } catch (error) {
      console.error('Failed to load torrents:', error);
    }
  }, [authState.isAuthenticated]);

  useEffect(() => {
    if (authState.isAuthenticated) {
      loadTorrents();
      // Set up polling for torrent updates every 5 seconds
      const interval = setInterval(loadTorrents, 5000);
      return () => clearInterval(interval);
    }
  }, [authState.isAuthenticated, loadTorrents]);

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setAuthError('');

    try {
      if (authMode === 'register') {
        const registerData: RegisterInput = {
          email: authForm.email,
          password: authForm.password,
          name: authForm.name
        };
        const result = await trpc.register.mutate(registerData);
        // Register currently returns just User, but we'll create a temporary session
        // This should be updated when the backend properly returns session data
        const sessionId = `temp-session-${Date.now()}`;
        localStorage.setItem('sessionId', sessionId);
        setAuthState({
          isAuthenticated: true,
          user: result,
          sessionId: sessionId
        });
        setAuthForm({ email: '', password: '', name: '' });
      } else {
        const loginData: LoginInput = {
          email: authForm.email,
          password: authForm.password
        };
        const result = await trpc.login.mutate(loginData);
        if (result.session) {
          localStorage.setItem('sessionId', result.session.id);
          setAuthState({
            isAuthenticated: true,
            user: result.user,
            sessionId: result.session.id
          });
          setAuthForm({ email: '', password: '', name: '' });
        }
      }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Authentication failed';
      setAuthError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  const handleLogout = async () => {
    if (!authState.sessionId) return;
    
    try {
      await trpc.logout.mutate({ session_id: authState.sessionId });
    } catch (error) {
      console.error('Logout failed:', error);
    } finally {
      localStorage.removeItem('sessionId');
      setAuthState({
        isAuthenticated: false,
        user: null,
        sessionId: null
      });
      setTorrents([]);
    }
  };



  const handleTorrentAction = async (torrentId: string, action: 'pause' | 'resume' | 'delete' | 'download') => {
    try {
      switch (action) {
        case 'pause':
          await trpc.pauseTorrent.mutate({ torrent_id: torrentId });
          break;
        case 'resume':
          await trpc.resumeTorrent.mutate({ torrent_id: torrentId });
          break;
        case 'delete':
          await trpc.deleteTorrent.mutate({ torrent_id: torrentId });
          break;
        case 'download':
          // This would typically trigger a file download or open a file browser
          // For now, we'll use the downloadFile API as a placeholder
          await trpc.downloadFile.mutate({ 
            torrent_id: torrentId, 
            file_path: '' // This should be the specific file path
          });
          break;
      }
      loadTorrents();
    } catch (error) {
      console.error(`Failed to ${action} torrent:`, error);
    }
  };



  if (!authState.isAuthenticated) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle className="text-2xl text-center">
              {authMode === 'login' ? '🌊 Torrent Manager' : '🚀 Join Torrent Manager'}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleAuth} className="space-y-4">
              {authMode === 'register' && (
                <div className="space-y-1">
                  <Input
                    placeholder="Full Name"
                    value={authForm.name}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                      setAuthForm((prev) => ({ ...prev, name: e.target.value }));
                      setAuthError('');
                    }}
                    required
                  />
                </div>
              )}
              <div className="space-y-1">
                <Input
                  type="email"
                  placeholder="Email Address"
                  value={authForm.email}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                    setAuthForm((prev) => ({ ...prev, email: e.target.value }));
                    setAuthError('');
                  }}
                  required
                />
              </div>
              <div className="space-y-1">
                <Input
                  type="password"
                  placeholder="Password (minimum 8 characters)"
                  value={authForm.password}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                    setAuthForm((prev) => ({ ...prev, password: e.target.value }));
                    setAuthError('');
                  }}
                  required
                  minLength={8}
                />
              </div>
              {authError && (
                <div className="bg-red-50 border border-red-200 rounded-md p-3 text-red-800 text-sm">
                  ❌ {authError}
                </div>
              )}
              <Button type="submit" className="w-full" disabled={isLoading}>
                {isLoading 
                  ? (authMode === 'login' ? '🔄 Signing In...' : '🔄 Creating Account...')
                  : (authMode === 'login' ? '🔐 Sign In' : '✨ Create Account')
                }
              </Button>
            </form>
            <div className="mt-4 text-center">
              <Button
                variant="ghost"
                onClick={() => {
                  setAuthMode(authMode === 'login' ? 'register' : 'login');
                  setAuthError('');
                  setAuthForm({ email: '', password: '', name: '' });
                }}
              >
                {authMode === 'login' 
                  ? "Don't have an account? Sign up" 
                  : "Already have an account? Sign in"
                }
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  const activeTorrents = torrents.filter((t: Torrent) => ['downloading', 'paused', 'seeding'].includes(t.status));
  const completedTorrents = torrents.filter((t: Torrent) => t.status === 'completed');

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50">
      {/* Header */}
      <div className="bg-white shadow-sm border-b">
        <div className="container mx-auto px-4 py-4 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-slate-800">🌊 Torrent Manager</h1>
            {torrents.length > 0 && (
              <Badge variant="secondary" className="hidden sm:inline-flex">
                {torrents.filter((t: Torrent) => t.status === 'downloading').length} downloading
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-4">
            <div className="hidden sm:block text-slate-600">
              Welcome back, <span className="font-medium">{authState.user?.name}</span>! 👋
            </div>
            <Button variant="outline" onClick={handleLogout} size="sm">
              🚪 Sign Out
            </Button>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 py-6">
        {/* Statistics */}
        {torrents.length > 0 && <TorrentStats torrents={torrents} />}
        
        {/* Action Bar */}
        <div className="mb-6 flex justify-between items-center">
          <div className="flex gap-3">
            <Badge variant="secondary" className="text-base px-4 py-2 shadow-sm">
              📊 {activeTorrents.length} Active
            </Badge>
            <Badge variant="outline" className="text-base px-4 py-2 shadow-sm">
              ✅ {completedTorrents.length} Completed
            </Badge>
          </div>
          
          <AddTorrentDialog onTorrentAdded={loadTorrents} />
        </div>

        {/* Torrents */}
        <Tabs defaultValue="active" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="active">⚡ Active Downloads</TabsTrigger>
            <TabsTrigger value="completed">✅ Completed</TabsTrigger>
          </TabsList>
          
          <TabsContent value="active" className="space-y-4">
            {activeTorrents.length === 0 ? (
              <Card className="text-center py-12">
                <CardContent>
                  <div className="text-6xl mb-4">🌊</div>
                  <h3 className="text-xl font-semibold mb-2">No Active Downloads</h3>
                  <p className="text-slate-600 mb-4">Add a torrent to get started!</p>
                  <AddTorrentDialog onTorrentAdded={loadTorrents} />
                </CardContent>
              </Card>
            ) : (
              activeTorrents.map((torrent: Torrent) => (
                <TorrentCard
                  key={torrent.id}
                  torrent={torrent}
                  onAction={handleTorrentAction}
                />
              ))
            )}
          </TabsContent>
          
          <TabsContent value="completed" className="space-y-4">
            {completedTorrents.length === 0 ? (
              <Card className="text-center py-12">
                <CardContent>
                  <div className="text-6xl mb-4">🎯</div>
                  <h3 className="text-xl font-semibold mb-2">No Completed Downloads</h3>
                  <p className="text-slate-600">Your completed torrents will appear here.</p>
                </CardContent>
              </Card>
            ) : (
              completedTorrents.map((torrent: Torrent) => (
                <TorrentCard
                  key={torrent.id}
                  torrent={torrent}
                  onAction={handleTorrentAction}
                  isCompleted={true}
                />
              ))
            )}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

export default App;