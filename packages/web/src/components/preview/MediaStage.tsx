import { useEffect, useRef, useState } from 'react';
import { getPlaybackUrl } from '../../api/assets';
import type { Asset } from '../../state/types';
import { PlayButton } from './PlayButton';
import { LightboxError } from './LightboxError';
import styles from './MediaStage.module.css';

type Stage = 'thumbnail' | 'media' | 'error';

function MediaStageInner({
  orgId,
  asset,
  posterUrl,
  onError,
}: {
  orgId: string;
  asset: Asset;
  posterUrl?: string | null;
  onError: (err: Error) => void;
}) {
  const [stage, setStage] = useState<Stage>('thumbnail');
  const [playbackUrl, setPlaybackUrl] = useState<string | null>(null);
  const [started, setStarted] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);

  useEffect(() => {
    let cancelled = false;
    getPlaybackUrl(orgId, asset.id)
      .then(({ downloadUrl }) => {
        if (!cancelled) {
          setPlaybackUrl(downloadUrl);
          setStage('media');
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setStage('error');
          onError(err instanceof Error ? err : new Error(String(err)));
        }
      });
    return () => { cancelled = true; };
  }, [orgId, asset.id, onError]);

  const handlePlay = () => {
    setStarted(true);
    if (asset.type === 'video') videoRef.current?.play().catch(() => {});
    else if (asset.type === 'audio') audioRef.current?.play().catch(() => {});
  };

  const handleMediaError = (e: React.SyntheticEvent<HTMLMediaElement>) => {
    setStage('error');
    onError(new Error(`media_element_error: ${e.type}`));
  };

  if (stage === 'error') {
    return (
      <div className={styles.stage}>
        <LightboxError message="加载失败" onRetry={() => setStage('thumbnail')} />
      </div>
    );
  }

  const thumbSrc = asset._thumbnailUrl ?? null;

  return (
    <div className={styles.stage}>
      {asset.type === 'image' && (
        <>
          {thumbSrc && (
            <img
              src={thumbSrc}
              alt=""
              className={stage === 'media' ? styles.thumbFading : styles.thumb}
            />
          )}
          {playbackUrl && (
            <img
              src={playbackUrl}
              alt={asset.name}
              className={stage === 'media' ? styles.media : styles.mediaHidden}
              onLoad={() => setStage('media')}
              onError={handleMediaError as unknown as React.ReactEventHandler<HTMLImageElement>}
            />
          )}
        </>
      )}

      {asset.type === 'video' && (
        <>
          {posterUrl && (
            <img
              src={posterUrl}
              alt=""
              className={started ? styles.mediaHidden : styles.poster}
            />
          )}
          {!started && <PlayButton onClick={handlePlay} />}
          {playbackUrl && (
            <video
              ref={videoRef}
              src={playbackUrl}
              controls
              className={started ? styles.media : styles.mediaHidden}
              poster={posterUrl ?? undefined}
              onError={handleMediaError}
            />
          )}
        </>
      )}

      {asset.type === 'audio' && (
        <div className={styles.audioCover}>
          {!started ? (
            <>
              <div className={styles.audioIcon} aria-hidden="true">♪</div>
              <div className={styles.audioLabel}>{asset.name}</div>
              <PlayButton onClick={handlePlay} />
            </>
          ) : (
            playbackUrl && (
              <audio
                ref={audioRef}
                src={playbackUrl}
                controls
                className={styles.audioControls}
                onError={handleMediaError}
              />
            )
          )}
        </div>
      )}
    </div>
  );
}

// Public API: when orgId or asset.id changes, the inner component remounts,
// which resets stage/playbackUrl/started naturally (no setState in effect).
export function MediaStage({
  orgId,
  asset,
  posterUrl,
  onError,
}: {
  orgId: string;
  asset: Asset;
  posterUrl?: string | null;
  onError: (err: Error) => void;
}) {
  return <MediaStageInner key={`${orgId}:${asset.id}`} orgId={orgId} asset={asset} posterUrl={posterUrl} onError={onError} />;
}
