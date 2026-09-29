import type { Internship } from '../../api/types';
import { placeCover } from './cover';

type Variant = 'tile' | 'thumb' | 'banner';

/** Обложка опубликованного места: плитка в «Моих местах», миниатюра в шапке кандидатов, баннер шторки. */
export function PlaceArt({ place, variant }: { place: Pick<Internship, 'id' | 'tags' | 'type'>; variant: Variant }) {
  const cover = placeCover(place);
  const ring = variant === 'banner' ? 260 : 150;
  return (
    <span className={`cover ${cover.cls} pl-cover pl-cover-${variant}`} aria-hidden="true">
      {cover.cls === 'cv-data' ? (
        <span className="cv-grid" />
      ) : (
        variant !== 'thumb' && (
          <span className="cv-ring" style={{ width: ring, height: ring, right: -ring / 3, top: -ring / 3 }} />
        )
      )}
      {variant !== 'thumb' && (
        <span className="cv-label" lang="ru">
          {cover.label}
        </span>
      )}
    </span>
  );
}
