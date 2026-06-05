import {
  IconCopy,
  IconDownload,
  IconStar,
  IconStarFilled,
  IconTrash,
  IconRestore,
} from '@tabler/icons-react';
import type { Asset } from '../../state/types';
import type { ContextMenuItem } from '../common/ContextMenu';

interface AssetRowMenuArgs {
  asset: Asset;
  onCopyLink: (asset: Asset) => void;
  onDownload: (asset: Asset) => void;
  onToggleFavorite: (asset: Asset) => void;
  onDelete: (asset: Asset) => void;       // soft delete (to trash) or permanent (if in trash)
  onRestore?: (asset: Asset) => void;    // only when in trash
}

export function buildAssetRowMenuItems({
  asset,
  onCopyLink,
  onDownload,
  onToggleFavorite,
  onDelete,
  onRestore,
}: AssetRowMenuArgs): ContextMenuItem[] {
  const inTrash = asset.deletedAt !== null;
  // Divider keys just need to be unique within this array; an auto-incremented
  // counter is robust against future reordering (no more 'div1/div2/div3'
  // hard-codes that break if items are added between them).
  let dividerCount = 0;
  const div = (): ContextMenuItem => ({
    key: `div-${++dividerCount}`,
    label: '',
    divider: true,
  });
  const items: ContextMenuItem[] = [
    {
      key: 'fav',
      label: asset.favorite ? '取消收藏' : '收藏',
      icon: asset.favorite
        ? <IconStarFilled size={14} aria-hidden="true" />
        : <IconStar size={14} aria-hidden="true" />,
      onClick: () => onToggleFavorite(asset),
      disabled: inTrash,
    },
    div(),
    {
      key: 'copy',
      label: '复制链接',
      icon: <IconCopy size={14} aria-hidden="true" />,
      onClick: () => onCopyLink(asset),
      disabled: inTrash,
    },
    {
      key: 'download',
      label: '下载',
      icon: <IconDownload size={14} aria-hidden="true" />,
      onClick: () => onDownload(asset),
      disabled: inTrash,
    },
  ];

  if (inTrash && onRestore) {
    items.push(div());
    items.push({
      key: 'restore',
      label: '恢复',
      icon: <IconRestore size={14} aria-hidden="true" />,
      onClick: () => onRestore(asset),
    });
  }

  items.push(div());
  items.push({
    key: 'delete',
    label: inTrash ? '永久删除' : '移到回收站',
    icon: <IconTrash size={14} aria-hidden="true" />,
    danger: true,
    onClick: () => onDelete(asset),
  });

  return items;
}
