/**
 * StorageManagement
 * 存储管理组件 - 显示存储统计和清理功能
 */

import { useState } from 'react';
import { HardDrive, Trash2, Loader2, AlertTriangle } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { useStorageStats, useCleanupArtifacts } from '@/hooks/useArtifacts';

export function StorageManagement() {
  const [showConfirm, setShowConfirm] = useState(false);

  const { data: stats, isLoading, error } = useStorageStats();
  const cleanupMutation = useCleanupArtifacts();

  const handleCleanup = async () => {
    try {
      await cleanupMutation.mutateAsync();
      setShowConfirm(false);
    } catch (err) {
      console.error('Cleanup failed:', err);
    }
  };

  if (isLoading) {
    return (
      <div className="rounded-xl border border-border bg-card p-6">
        <div className="flex items-center gap-3">
          <Loader2 className="size-5 animate-spin text-muted-foreground" />
          <span className="text-sm text-muted-foreground">加载存储信息...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl border border-destructive/50 bg-destructive/10 p-6">
        <div className="flex items-center gap-3">
          <AlertTriangle className="size-5 text-destructive" />
          <span className="text-sm text-destructive">
            加载存储信息失败: {error instanceof Error ? error.message : '未知错误'}
          </span>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="rounded-xl border border-border bg-card p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="flex items-center justify-center size-10 rounded-lg bg-muted">
            <HardDrive className="size-5 text-muted-foreground" />
          </div>
          <div>
            <h3 className="font-medium text-foreground">存储管理</h3>
            <p className="text-sm text-muted-foreground">管理生成的图片产物</p>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <StatCard label="活跃版本" value={stats?.activeArtifacts ?? 0} />
          <StatCard label="已删除版本" value={stats?.deletedArtifacts ?? 0} />
          <StatCard label="文件数量" value={stats?.totalFiles ?? 0} />
          <StatCard label="占用空间" value={`${stats?.totalSizeMB ?? 0} MB`} />
        </div>

        {(stats?.deletedArtifacts ?? 0) > 0 && (
          <div className="flex items-center justify-between p-4 rounded-lg bg-muted/60">
            <div>
              <p className="text-sm font-medium text-foreground">
                有 {stats?.deletedArtifacts} 个已删除的版本可清理
              </p>
              <p className="text-xs text-muted-foreground">
                清理后将永久删除文件，释放磁盘空间
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowConfirm(true)}
              disabled={cleanupMutation.isPending}
            >
              <Trash2 className="size-4" />
              清理空间
            </Button>
          </div>
        )}

        {cleanupMutation.isSuccess && cleanupMutation.data && (
          <div className="mt-4 p-3 rounded-lg bg-green-500/10 text-green-700 dark:text-green-400 text-sm">
            已清理 {cleanupMutation.data.deletedCount} 个文件，
            释放 {cleanupMutation.data.freedMB} MB 空间
          </div>
        )}
      </div>

      {/* 确认对话框 */}
      <Dialog open={showConfirm} onOpenChange={setShowConfirm}>
        <DialogContent>
          <DialogTitle>确认清理</DialogTitle>
          <DialogDescription>
            将永久删除 {stats?.deletedArtifacts} 个已删除的版本文件。此操作不可撤销。
          </DialogDescription>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowConfirm(false)}>
              取消
            </Button>
            <Button
              variant="destructive"
              onClick={handleCleanup}
              disabled={cleanupMutation.isPending}
            >
              {cleanupMutation.isPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Trash2 className="size-4" />
              )}
              确认清理
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="p-3 rounded-lg bg-muted/60">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-lg font-semibold text-foreground">{value}</p>
    </div>
  );
}
