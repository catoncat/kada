/**
 * StorageManagement
 * 存储管理组件 - 显示存储统计和清理功能
 */

import { AlertTriangle, HardDrive, Loader2, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  AlertDialog,
  AlertDialogClose,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogPopup,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { useCleanupArtifacts, useStorageStats } from '@/hooks/useArtifacts';

export function StorageManagement() {
  const [showConfirm, setShowConfirm] = useState(false);

  const { data: stats, isLoading, error } = useStorageStats();
  const cleanupMutation = useCleanupArtifacts();

  const sectionHeader = (
    <div>
      <h2 className="mb-1 text-lg font-semibold text-foreground">存储管理</h2>
      <p className="text-sm text-muted-foreground">
        查看存储占用并清理已删除版本残留文件。
      </p>
    </div>
  );

  const handleCleanup = async () => {
    try {
      await cleanupMutation.mutateAsync();
      setShowConfirm(false);
    } catch (cleanupError) {
      console.error('Cleanup failed:', cleanupError);
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        {sectionHeader}
        <div className="rounded-xl border border-border bg-card p-6">
          <div className="flex items-center gap-3">
            <Loader2 className="size-5 animate-spin text-muted-foreground" />
            <span className="text-sm text-muted-foreground">加载存储信息中...</span>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-6">
        {sectionHeader}
        <Alert variant="error">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>存储信息加载失败</AlertTitle>
          <AlertDescription>
            {error instanceof Error ? error.message : '未知错误'}
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  const deletedArtifacts = stats?.deletedArtifacts ?? 0;

  return (
    <div className="space-y-6">
      {sectionHeader}

      <div className="space-y-4 rounded-xl border border-border bg-card p-6">
        <div className="flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-lg bg-muted">
            <HardDrive className="size-5 text-muted-foreground" />
          </div>
          <div>
            <h3 className="text-sm font-medium text-foreground">存储概览</h3>
            <p className="text-xs text-muted-foreground">当前项目的本地文件统计</p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <StatCard label="活跃版本" value={stats?.activeArtifacts ?? 0} />
          <StatCard label="已删除版本" value={deletedArtifacts} />
          <StatCard label="文件数量" value={stats?.totalFiles ?? 0} />
          <StatCard label="占用空间" value={`${stats?.totalSizeMB ?? 0} MB`} />
        </div>
      </div>

      {deletedArtifacts > 0 ? (
        <div className="flex items-center justify-between rounded-xl border border-border bg-card p-4">
          <div>
            <p className="text-sm font-medium text-foreground">
              有 {deletedArtifacts} 个已删除版本可清理
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
      ) : (
        <div className="rounded-xl border border-dashed border-border bg-card p-4 text-sm text-muted-foreground">
          当前没有可清理的已删除版本文件。
        </div>
      )}

      {cleanupMutation.isSuccess && cleanupMutation.data && (
        <Alert variant="success">
          <AlertDescription>
            已清理 {cleanupMutation.data.deletedCount} 个文件，释放{' '}
            {cleanupMutation.data.freedMB} MB 空间。
          </AlertDescription>
        </Alert>
      )}

      <AlertDialog
        open={showConfirm}
        onOpenChange={setShowConfirm}
      >
        <AlertDialogPopup className="p-0">
          <AlertDialogHeader>
            <AlertDialogTitle>确认清理存储空间</AlertDialogTitle>
            <AlertDialogDescription>
              将永久删除 {deletedArtifacts} 个已删除版本文件。此操作不可撤销。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogClose render={<Button variant="outline" />}>
              取消
            </AlertDialogClose>
            <Button
              variant="destructive"
              onClick={() => void handleCleanup()}
              disabled={cleanupMutation.isPending}
            >
              {cleanupMutation.isPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Trash2 className="size-4" />
              )}
              确认清理
            </Button>
          </AlertDialogFooter>
        </AlertDialogPopup>
      </AlertDialog>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg bg-muted/60 p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-lg font-semibold text-foreground">{value}</p>
    </div>
  );
}
