import { Folder, FolderPlus, Loader2, Database } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/utils/cn';

interface DatabaseSelectorProps {
  databases: string[];
  loadingDatabases: boolean;
  isReadOnly: boolean;
  selectedDatabase: string | null;
  onSelectDatabase: (db: string) => void;
  onCreateDatabase: () => void;
}

export function DatabaseSelector({
  databases,
  loadingDatabases,
  isReadOnly,
  selectedDatabase,
  onSelectDatabase,
  onCreateDatabase,
}: DatabaseSelectorProps) {
  return (
    <div className="h-full flex gap-4 p-4">
      <Card className="flex-1 border-border/60 bg-card/90 shadow-card backdrop-blur-sm">
        <CardHeader className="border-b border-border/60 bg-gradient-to-b from-background to-muted/10 pb-3">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-mysql/10">
              <Database className="h-4 w-4 text-mysql" />
            </div>
            <CardTitle className="text-sm font-semibold">选择数据库</CardTitle>
            <div className="ml-auto flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                className="h-7 gap-1 text-xs"
                onClick={onCreateDatabase}
                disabled={isReadOnly || loadingDatabases}
              >
                <FolderPlus className="h-3.5 w-3.5" />
                新建数据库
              </Button>
              <Badge variant="secondary" className="text-xs shadow-sm">
                {databases.length}
              </Badge>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loadingDatabases ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : databases.length === 0 ? (
            <div className="flex items-center justify-center py-8 text-muted-foreground">
              暂无数据库
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
              {databases.map(db => (
                <button
                  key={db}
                  onClick={() => onSelectDatabase(db)}
                  className={cn(
                    'group flex items-center gap-2 rounded-xl border border-border/60 bg-background/80 p-3 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:border-primary/30 hover:bg-accent/30 hover:shadow-md',
                    selectedDatabase === db && 'border-primary/30 bg-primary/10'
                  )}
                >
                  <div className="rounded-lg bg-mysql/10 p-1.5 transition-colors group-hover:bg-mysql/15">
                    <Folder className="h-4 w-4 text-mysql" />
                  </div>
                  <span className="text-sm font-medium truncate">{db}</span>
                </button>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
