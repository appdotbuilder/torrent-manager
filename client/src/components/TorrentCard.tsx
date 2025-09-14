import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import type { Torrent } from '../../../server/src/schema';

interface TorrentCardProps {
  torrent: Torrent;
  onAction: (torrentId: string, action: 'pause' | 'resume' | 'delete' | 'download') => void;
  isCompleted?: boolean;
}

export function TorrentCard({ torrent, onAction, isCompleted = false }: TorrentCardProps) {
  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
  };

  const formatSpeed = (bytesPerSecond: number) => {
    return `${formatBytes(bytesPerSecond)}/s`;
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'downloading': return 'bg-blue-500';
      case 'completed': return 'bg-green-500';
      case 'seeding': return 'bg-purple-500';
      case 'paused': return 'bg-yellow-500';
      case 'error': return 'bg-red-500';
      default: return 'bg-gray-500';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'downloading': return '⬇️';
      case 'completed': return '✅';
      case 'seeding': return '🌱';
      case 'paused': return '⏸️';
      case 'error': return '❌';
      default: return '🔄';
    }
  };

  const formatTimeAgo = (date: Date) => {
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffMinutes = Math.floor(diffMs / (1000 * 60));

    if (diffDays > 0) return `${diffDays}d ago`;
    if (diffHours > 0) return `${diffHours}h ago`;
    if (diffMinutes > 0) return `${diffMinutes}m ago`;
    return 'Just now';
  };

  if (isCompleted) {
    return (
      <Card className="torrent-card overflow-hidden">
        <CardContent className="p-6">
          <div className="flex items-start justify-between">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-3 mb-3">
                <span className="text-2xl">{getStatusIcon(torrent.status)}</span>
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-lg truncate text-gray-900">{torrent.name}</h3>
                  <div className="flex items-center gap-2 mt-1">
                    <Badge className={`${getStatusColor(torrent.status)} text-white capitalize`}>
                      {torrent.status}
                    </Badge>
                    <span className="text-sm text-gray-500">
                      📅 {torrent.completed_at?.toLocaleDateString() || formatTimeAgo(torrent.created_at)}
                    </span>
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
                <div className="flex items-center gap-2 text-gray-600">
                  <span className="text-blue-600">📊</span>
                  <span className="font-medium">Size:</span>
                  <span>{formatBytes(torrent.total_size)}</span>
                </div>
                <div className="flex items-center gap-2 text-gray-600">
                  <span className="text-green-600">📁</span>
                  <span className="font-medium">Files:</span>
                  <span>Ready to download</span>
                </div>
                <div className="flex items-center gap-2 text-gray-600">
                  <span className="text-purple-600">🏷️</span>
                  <span className="font-medium">Hash:</span>
                  <span className="font-mono text-xs">{torrent.info_hash.substring(0, 8)}...</span>
                </div>
              </div>
            </div>
            <div className="flex gap-2 ml-4">
              <Button
                size="sm"
                onClick={() => onAction(torrent.id, 'download')}
                className="bg-green-600 hover:bg-green-700 text-white"
              >
                📥 Download
              </Button>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button size="sm" variant="outline" className="hover:bg-red-50 hover:border-red-200">
                    🗑️
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle className="flex items-center gap-2">
                      🗑️ Delete Completed Torrent
                    </AlertDialogTitle>
                    <AlertDialogDescription>
                      Are you sure you want to delete <strong>"{torrent.name}"</strong> and all its downloaded files? 
                      This action cannot be undone.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction 
                      onClick={() => onAction(torrent.id, 'delete')}
                      className="bg-red-600 hover:bg-red-700"
                    >
                      Delete Files
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="torrent-card overflow-hidden">
      <CardContent className="p-6">
        <div className="flex items-start justify-between mb-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3 mb-3">
              <span className="text-2xl">{getStatusIcon(torrent.status)}</span>
              <div className="flex-1 min-w-0">
                <h3 className="font-semibold text-lg truncate text-gray-900">{torrent.name}</h3>
                <div className="flex items-center gap-2 mt-1">
                  <Badge className={`${getStatusColor(torrent.status)} text-white capitalize`}>
                    {torrent.status}
                  </Badge>
                  <span className="text-sm text-gray-500">
                    Started {formatTimeAgo(torrent.created_at)}
                  </span>
                </div>
              </div>
            </div>
            
            {/* Progress Section */}
            <div className="mb-4">
              <div className="flex justify-between items-center text-sm mb-2">
                <span className="font-medium text-gray-700">
                  {torrent.progress.toFixed(1)}% complete
                </span>
                <div className="flex items-center gap-4 text-xs">
                  <span className="speed-indicator speed-download">
                    ⬇️ {formatSpeed(torrent.download_speed)}
                  </span>
                  <span className="speed-indicator speed-upload">
                    ⬆️ {formatSpeed(torrent.upload_speed)}
                  </span>
                </div>
              </div>
              <Progress 
                value={torrent.progress} 
                className="h-2 progress-bar"
              />
            </div>

            {/* Stats Grid */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 text-sm">
              <div className="flex items-center gap-2 text-gray-600">
                <span className="text-blue-600">📊</span>
                <div>
                  <div className="font-medium">Total Size</div>
                  <div>{formatBytes(torrent.total_size)}</div>
                </div>
              </div>
              <div className="flex items-center gap-2 text-gray-600">
                <span className="text-green-600">📥</span>
                <div>
                  <div className="font-medium">Downloaded</div>
                  <div>{formatBytes(torrent.downloaded_size)}</div>
                </div>
              </div>
              <div className="flex items-center gap-2 text-gray-600">
                <span className="text-purple-600">👥</span>
                <div>
                  <div className="font-medium">Peers</div>
                  <div>{torrent.peers} connected</div>
                </div>
              </div>
              <div className="flex items-center gap-2 text-gray-600">
                <span className="text-yellow-600">🌱</span>
                <div>
                  <div className="font-medium">Seeds</div>
                  <div>{torrent.seeds} available</div>
                </div>
              </div>
            </div>
          </div>
          
          {/* Action Buttons */}
          <div className="flex gap-2 ml-4">
            {torrent.status === 'downloading' || torrent.status === 'seeding' ? (
              <Button
                size="sm"
                variant="outline"
                onClick={() => onAction(torrent.id, 'pause')}
                className="hover:bg-yellow-50 hover:border-yellow-200"
              >
                ⏸️ Pause
              </Button>
            ) : torrent.status === 'paused' ? (
              <Button
                size="sm"
                variant="outline"
                onClick={() => onAction(torrent.id, 'resume')}
                className="hover:bg-green-50 hover:border-green-200"
              >
                ▶️ Resume
              </Button>
            ) : null}
            
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button size="sm" variant="outline" className="hover:bg-red-50 hover:border-red-200">
                  🗑️
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle className="flex items-center gap-2">
                    🗑️ Delete Torrent
                  </AlertDialogTitle>
                  <AlertDialogDescription>
                    Are you sure you want to delete <strong>"{torrent.name}"</strong>? This will stop the download and remove all associated files. This action cannot be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction 
                    onClick={() => onAction(torrent.id, 'delete')}
                    className="bg-red-600 hover:bg-red-700"
                  >
                    Delete Torrent
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}