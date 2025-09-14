import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { trpc } from '@/utils/trpc';
import type { CreateTorrentFromMagnetInput, CreateTorrentFromFileInput } from '../../../server/src/schema';

interface AddTorrentDialogProps {
  onTorrentAdded: () => void;
}

export function AddTorrentDialog({ onTorrentAdded }: AddTorrentDialogProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string>('');

  // Magnet form state
  const [magnetForm, setMagnetForm] = useState({
    magnet_link: '',
    name: ''
  });

  // File form state
  const [torrentFile, setTorrentFile] = useState<File | null>(null);
  const [torrentFileName, setTorrentFileName] = useState('');

  const resetForms = () => {
    setMagnetForm({ magnet_link: '', name: '' });
    setTorrentFile(null);
    setTorrentFileName('');
    setError('');
  };

  const handleMagnetSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');

    try {
      const data: CreateTorrentFromMagnetInput = {
        magnet_link: magnetForm.magnet_link,
        name: magnetForm.name || undefined
      };
      await trpc.createTorrentFromMagnet.mutate(data);
      resetForms();
      setIsOpen(false);
      onTorrentAdded();
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to add magnet torrent';
      setError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  const handleFileSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!torrentFile) return;
    
    setIsLoading(true);
    setError('');

    try {
      const fileData = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(btoa(reader.result as string));
        reader.onerror = reject;
        reader.readAsBinaryString(torrentFile);
      });

      const data: CreateTorrentFromFileInput = {
        name: torrentFileName,
        torrent_file_data: fileData
      };
      await trpc.createTorrentFromFile.mutate(data);
      resetForms();
      setIsOpen(false);
      onTorrentAdded();
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to upload torrent file';
      setError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setTorrentFile(file);
      setTorrentFileName(file.name.replace('.torrent', ''));
      setError('');
    }
  };

  const validateMagnetLink = (link: string) => {
    return link.startsWith('magnet:?xt=urn:btih:') || link.startsWith('magnet:?xt=urn:btmh:');
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => {
      setIsOpen(open);
      if (!open) resetForms();
    }}>
      <DialogTrigger asChild>
        <Button className="bg-blue-600 hover:bg-blue-700 shadow-lg">
          ➕ Add Torrent
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="text-2xl flex items-center gap-2">
            🆕 Add New Torrent
          </DialogTitle>
        </DialogHeader>
        
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-red-800 text-sm">
            ❌ {error}
          </div>
        )}
        
        <Tabs defaultValue="magnet" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="magnet" className="flex items-center gap-2">
              🧲 Magnet Link
            </TabsTrigger>
            <TabsTrigger value="file" className="flex items-center gap-2">
              📁 Torrent File
            </TabsTrigger>
          </TabsList>
          
          <TabsContent value="magnet" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">🧲 Add from Magnet Link</CardTitle>
                <CardDescription>
                  Paste a magnet link to start downloading. The torrent name will be automatically detected.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleMagnetSubmit} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="magnet-link">Magnet Link *</Label>
                    <Input
                      id="magnet-link"
                      placeholder="magnet:?xt=urn:btih:..."
                      value={magnetForm.magnet_link}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                        setMagnetForm((prev) => ({ ...prev, magnet_link: e.target.value }));
                        setError('');
                      }}
                      className={`file-input ${magnetForm.magnet_link && !validateMagnetLink(magnetForm.magnet_link) ? 'border-red-300 focus:border-red-500' : ''}`}
                      required
                    />
                    {magnetForm.magnet_link && !validateMagnetLink(magnetForm.magnet_link) && (
                      <p className="text-red-600 text-sm">Please enter a valid magnet link</p>
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="magnet-name">Custom Name (optional)</Label>
                    <Input
                      id="magnet-name"
                      placeholder="Leave empty to use detected name"
                      value={magnetForm.name}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                        setMagnetForm((prev) => ({ ...prev, name: e.target.value }))
                      }
                    />
                  </div>
                  <Button 
                    type="submit" 
                    disabled={isLoading || !magnetForm.magnet_link || !validateMagnetLink(magnetForm.magnet_link)} 
                    className="w-full"
                  >
                    {isLoading ? '🔄 Adding Magnet...' : '🚀 Start Download'}
                  </Button>
                </form>
              </CardContent>
            </Card>
          </TabsContent>
          
          <TabsContent value="file" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">📁 Upload Torrent File</CardTitle>
                <CardDescription>
                  Upload a .torrent file from your device to start downloading.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleFileSubmit} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="torrent-file">Torrent File *</Label>
                    <Input
                      id="torrent-file"
                      type="file"
                      accept=".torrent"
                      onChange={handleFileChange}
                      className="file-input"
                      required
                    />
                    {torrentFile && (
                      <div className="flex items-center gap-2 p-2 bg-blue-50 rounded-md">
                        <span className="text-blue-600">📁</span>
                        <span className="text-sm text-blue-800 font-medium">{torrentFile.name}</span>
                        <span className="text-xs text-blue-600">
                          ({(torrentFile.size / 1024).toFixed(1)} KB)
                        </span>
                      </div>
                    )}
                  </div>
                  {torrentFile && (
                    <div className="space-y-2">
                      <Label htmlFor="file-name">Torrent Name *</Label>
                      <Input
                        id="file-name"
                        placeholder="Enter a name for this torrent"
                        value={torrentFileName}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                          setTorrentFileName(e.target.value);
                          setError('');
                        }}
                        required
                      />
                    </div>
                  )}
                  <Button 
                    type="submit" 
                    disabled={isLoading || !torrentFile || !torrentFileName.trim()} 
                    className="w-full"
                  >
                    {isLoading ? '🔄 Uploading File...' : '📤 Upload & Start'}
                  </Button>
                </form>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
        
        <div className="text-xs text-gray-500 mt-4 p-3 bg-gray-50 rounded-lg">
          <p className="font-medium mb-1">💡 Tips:</p>
          <ul className="space-y-1">
            <li>• Magnet links are more convenient and don't require file uploads</li>
            <li>• Only upload .torrent files from trusted sources</li>
            <li>• Downloads will start automatically once added</li>
          </ul>
        </div>
      </DialogContent>
    </Dialog>
  );
}