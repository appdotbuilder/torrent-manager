import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import type { Torrent } from '../../../server/src/schema';

interface TorrentStatsProps {
  torrents: Torrent[];
}

export function TorrentStats({ torrents }: TorrentStatsProps) {
  const activeTorrents = torrents.filter((t: Torrent) => ['downloading', 'paused', 'seeding'].includes(t.status));
  const completedTorrents = torrents.filter((t: Torrent) => t.status === 'completed');
  const downloadingTorrents = torrents.filter((t: Torrent) => t.status === 'downloading');
  const seedingTorrents = torrents.filter((t: Torrent) => t.status === 'seeding');

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

  // Calculate total statistics
  const totalSize = torrents.reduce((acc: number, torrent: Torrent) => acc + torrent.total_size, 0);
  const totalDownloaded = torrents.reduce((acc: number, torrent: Torrent) => acc + torrent.downloaded_size, 0);
  const totalDownloadSpeed = downloadingTorrents.reduce((acc: number, torrent: Torrent) => acc + torrent.download_speed, 0);
  const totalUploadSpeed = seedingTorrents.reduce((acc: number, torrent: Torrent) => acc + torrent.upload_speed, 0);
  const totalPeers = activeTorrents.reduce((acc: number, torrent: Torrent) => acc + torrent.peers, 0);
  const totalSeeds = activeTorrents.reduce((acc: number, torrent: Torrent) => acc + torrent.seeds, 0);

  const overallProgress = totalSize > 0 ? (totalDownloaded / totalSize) * 100 : 0;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
      <Card className="bg-gradient-to-br from-blue-50 to-blue-100 border-blue-200">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-blue-800">📊 Total Progress</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold text-blue-900">{overallProgress.toFixed(1)}%</div>
          <p className="text-xs text-blue-600 mt-1">
            {formatBytes(totalDownloaded)} of {formatBytes(totalSize)}
          </p>
        </CardContent>
      </Card>

      <Card className="bg-gradient-to-br from-green-50 to-green-100 border-green-200">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-green-800">⚡ Current Speed</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold text-green-900">
            {formatSpeed(totalDownloadSpeed)}
          </div>
          <p className="text-xs text-green-600 mt-1">
            ⬆️ {formatSpeed(totalUploadSpeed)} upload
          </p>
        </CardContent>
      </Card>

      <Card className="bg-gradient-to-br from-purple-50 to-purple-100 border-purple-200">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-purple-800">🌐 Network</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold text-purple-900">{totalPeers}</div>
          <p className="text-xs text-purple-600 mt-1">
            peers · {totalSeeds} seeds
          </p>
        </CardContent>
      </Card>

      <Card className="bg-gradient-to-br from-orange-50 to-orange-100 border-orange-200">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-orange-800">📈 Status</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-1">
            {downloadingTorrents.length > 0 && (
              <Badge variant="secondary" className="text-xs bg-blue-100 text-blue-800">
                {downloadingTorrents.length} DL
              </Badge>
            )}
            {seedingTorrents.length > 0 && (
              <Badge variant="secondary" className="text-xs bg-purple-100 text-purple-800">
                {seedingTorrents.length} Seed
              </Badge>
            )}
            {completedTorrents.length > 0 && (
              <Badge variant="secondary" className="text-xs bg-green-100 text-green-800">
                {completedTorrents.length} Done
              </Badge>
            )}
          </div>
          <p className="text-xs text-orange-600 mt-1">
            {torrents.length} total torrents
          </p>
        </CardContent>
      </Card>
    </div>
  );
}