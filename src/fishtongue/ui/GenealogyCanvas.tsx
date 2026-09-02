import {
  EvolutionGraphMarker,
  Language,
  LanguageRelation,
  LanguageStage,
} from "@/fishtongue/domain/models";
import styles from "@/fishtongue/ui/HistoryWorkspaces.module.css";
import {
  EnterFullScreenIcon,
  MinusIcon,
  PlusIcon,
  QuestionMarkCircledIcon,
} from "@radix-ui/react-icons";
import {
  PointerEvent as ReactPointerEvent,
  WheelEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

const NODE_WIDTH = 176;
const NODE_HEIGHT = 58;
const STAGE_HEIGHT = 25;
const HORIZONTAL_GAP = 44;
const VERTICAL_GAP = 72;
const MIN_SCALE = 0.4;
const MAX_SCALE = 2;

export type GenealogyLayoutNode = {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  language: Language;
  stages: LanguageStage[];
};

export type GenealogyLayout = {
  nodes: GenealogyLayoutNode[];
  width: number;
  height: number;
};

export function layoutGenealogy(
  languages: Language[],
  relations: LanguageRelation[],
  stagesByLanguage: Map<string, LanguageStage[]>,
  expanded: Set<string>
): GenealogyLayout {
  const byId = new Map(languages.map((language) => [language.id, language]));
  const children = new Map<string, string[]>();
  const hasParent = new Set<string>();
  for (const relation of relations.filter((item) => item.kind === "genetic")) {
    if (
      !byId.has(relation.sourceLanguageId) ||
      !byId.has(relation.targetLanguageId)
    )
      continue;
    const values = children.get(relation.sourceLanguageId) ?? [];
    if (!values.includes(relation.targetLanguageId))
      values.push(relation.targetLanguageId);
    children.set(relation.sourceLanguageId, values);
    hasParent.add(relation.targetLanguageId);
  }
  const sortIds = (ids: string[]) =>
    ids.sort((left, right) =>
      (byId.get(left)?.name ?? "").localeCompare(
        byId.get(right)?.name ?? "",
        "zh-CN"
      )
    );
  children.forEach(sortIds);
  const roots = sortIds(
    languages
      .filter((language) => !hasParent.has(language.id))
      .map((language) => language.id)
  );
  const visited = new Set<string>();
  const forestRoots = [...roots];
  for (const language of [...languages].sort((a, b) =>
    a.name.localeCompare(b.name, "zh-CN")
  )) {
    if (!forestRoots.includes(language.id) && !hasParent.has(language.id))
      forestRoots.push(language.id);
  }

  const stageValues = (id: string) =>
    (stagesByLanguage.get(id) ?? [])
      .filter((stage) => stage.visible && stage.kind === "historical_stage")
      .sort((a, b) => a.position - b.position);
  const nodeHeight = (id: string) =>
    NODE_HEIGHT +
    (expanded.has(id) ? stageValues(id).length * STAGE_HEIGHT : 0);
  const subtreeWidth = (id: string, path = new Set<string>()): number => {
    if (path.has(id)) return NODE_WIDTH;
    const nextPath = new Set(path).add(id);
    const childIds = (children.get(id) ?? []).filter(
      (child) => !nextPath.has(child)
    );
    if (!childIds.length) return NODE_WIDTH;
    return Math.max(
      NODE_WIDTH,
      childIds.reduce(
        (sum, child, index) =>
          sum + subtreeWidth(child, nextPath) + (index ? HORIZONTAL_GAP : 0),
        0
      )
    );
  };

  const maxHeightByDepth = new Map<number, number>();
  const inspect = (id: string, depth: number, path = new Set<string>()) => {
    if (path.has(id)) return;
    maxHeightByDepth.set(
      depth,
      Math.max(maxHeightByDepth.get(depth) ?? 0, nodeHeight(id))
    );
    const nextPath = new Set(path).add(id);
    for (const child of children.get(id) ?? [])
      inspect(child, depth + 1, nextPath);
  };
  forestRoots.forEach((root) => inspect(root, 0));
  const yByDepth = new Map<number, number>();
  let nextY = 24;
  for (
    let depth = 0;
    depth <= Math.max(0, ...maxHeightByDepth.keys());
    depth += 1
  ) {
    yByDepth.set(depth, nextY);
    nextY += (maxHeightByDepth.get(depth) ?? NODE_HEIGHT) + VERTICAL_GAP;
  }

  const nodes: GenealogyLayoutNode[] = [];
  const place = (
    id: string,
    left: number,
    depth: number,
    path = new Set<string>()
  ) => {
    if (path.has(id) || visited.has(id)) return;
    const language = byId.get(id);
    if (!language) return;
    visited.add(id);
    const nextPath = new Set(path).add(id);
    const childIds = (children.get(id) ?? []).filter(
      (child) => !nextPath.has(child) && !visited.has(child)
    );
    const width = subtreeWidth(id, path);
    nodes.push({
      id,
      x: left + (width - NODE_WIDTH) / 2,
      y: yByDepth.get(depth) ?? 24,
      width: NODE_WIDTH,
      height: nodeHeight(id),
      language,
      stages: stageValues(id),
    });
    let childLeft = left;
    for (const child of childIds) {
      place(child, childLeft, depth + 1, nextPath);
      childLeft += subtreeWidth(child, nextPath) + HORIZONTAL_GAP;
    }
  };

  let left = 24;
  for (const root of forestRoots) {
    place(root, left, 0);
    left += subtreeWidth(root) + HORIZONTAL_GAP;
  }
  for (const language of languages) {
    if (!visited.has(language.id)) {
      place(language.id, left, 0);
      left += NODE_WIDTH + HORIZONTAL_GAP;
    }
  }
  const width = Math.max(360, ...nodes.map((node) => node.x + node.width + 24));
  const height = Math.max(
    260,
    ...nodes.map((node) => node.y + node.height + 36)
  );
  return { nodes, width, height };
}

type Props = {
  languages: Language[];
  relations: LanguageRelation[];
  stagesByLanguage: Map<string, LanguageStage[]>;
  onOpenLanguage?: (languageId: string) => void;
  onOpenStage?: (languageId: string, stageId: string) => void;
  evolutionMarkers?: EvolutionGraphMarker[];
  onOpenEvolutionMarker?: (marker: EvolutionGraphMarker) => void;
};

export default function GenealogyCanvas(props: Props) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [selectedId, setSelectedId] = useState<string>();
  const [showContact, setShowContact] = useState(false);
  const [showDialect, setShowDialect] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [view, setView] = useState({ scale: 1, x: 24, y: 24 });
  const dragRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    x: number;
    y: number;
  }>();
  const layout = useMemo(
    () =>
      layoutGenealogy(
        props.languages,
        props.relations,
        props.stagesByLanguage,
        expanded
      ),
    [expanded, props.languages, props.relations, props.stagesByLanguage]
  );
  const nodeById = useMemo(
    () => new Map(layout.nodes.map((node) => [node.id, node])),
    [layout.nodes]
  );

  const fit = () => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const scale = Math.max(
      MIN_SCALE,
      Math.min(
        1.35,
        (viewport.clientWidth - 72) / layout.width,
        (viewport.clientHeight - 72) / layout.height
      )
    );
    setView({
      scale,
      x: Math.max(28, (viewport.clientWidth - layout.width * scale) / 2),
      y: Math.max(28, (viewport.clientHeight - layout.height * scale) / 2),
    });
  };

  const initialLayout = `${props.languages
    .map((item) => item.id)
    .join(",")}:${props.relations.map((item) => item.id).join(",")}`;
  const fittedLayoutRef = useRef("");
  useEffect(() => {
    if (fittedLayoutRef.current === initialLayout) return;
    fittedLayoutRef.current = initialLayout;
    const frame = requestAnimationFrame(fit);
    return () => cancelAnimationFrame(frame);
    // fit intentionally follows the stable language/relation signature, not every stage toggle
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialLayout]);

  const zoom = (factor: number, clientX?: number, clientY?: number) => {
    const rect = viewportRef.current?.getBoundingClientRect();
    setView((current) => {
      const scale = Math.max(
        MIN_SCALE,
        Math.min(MAX_SCALE, current.scale * factor)
      );
      if (!rect || clientX === undefined || clientY === undefined)
        return { ...current, scale };
      const pointerX = clientX - rect.left;
      const pointerY = clientY - rect.top;
      const worldX = (pointerX - current.x) / current.scale;
      const worldY = (pointerY - current.y) / current.scale;
      return {
        scale,
        x: pointerX - worldX * scale,
        y: pointerY - worldY * scale,
      };
    });
  };
  const onWheel = (event: WheelEvent<HTMLDivElement>) => {
    event.preventDefault();
    zoom(event.deltaY < 0 ? 1.1 : 1 / 1.1, event.clientX, event.clientY);
  };
  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!event.ctrlKey || event.button !== 0) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      x: view.x,
      y: view.y,
    };
  };
  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    setView((current) => ({
      ...current,
      x: drag.x + event.clientX - drag.startX,
      y: drag.y + event.clientY - drag.startY,
    }));
  };
  const stopDragging = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (dragRef.current?.pointerId !== event.pointerId) return;
    dragRef.current = undefined;
    event.currentTarget.releasePointerCapture(event.pointerId);
  };

  const inheritanceEdges = props.relations.filter(
    (relation) => relation.kind === "genetic"
  );
  const contactCount = props.relations.filter(
    (relation) => relation.kind === "contact"
  ).length;
  const dialectCount = props.relations.filter(
    (relation) => relation.kind === "dialect"
  ).length;
  const overlayEdges = props.relations.filter(
    (relation) =>
      (showContact && relation.kind === "contact") ||
      (showDialect && relation.kind === "dialect")
  );
  const markerPosition = (marker: EvolutionGraphMarker, index: number) => {
    const source = nodeById.get(marker.sourceLanguageId);
    const target = nodeById.get(marker.targetLanguageId);
    if (!target) return null;
    if (!source || source.id === target.id) {
      return {
        x: target.x + target.width - 13 - (index % 4) * 16,
        y: target.y + target.height + 12 + Math.floor(index / 4) * 16,
      };
    }
    return {
      x:
        (source.x + source.width / 2 + target.x + target.width / 2) / 2 +
        ((index % 3) - 1) * 16,
      y: (source.y + source.height + target.y) / 2,
    };
  };
  const edge = (relation: LanguageRelation, overlay = false) => {
    const source = nodeById.get(relation.sourceLanguageId);
    const target = nodeById.get(relation.targetLanguageId);
    if (!source || !target) return null;
    const startX = source.x + source.width / 2;
    const startY = source.y + source.height;
    const endX = target.x + target.width / 2;
    const endY = target.y;
    const middleY = startY + (endY - startY) / 2;
    return (
      <path
        key={`${overlay ? "overlay" : "tree"}-${relation.id}`}
        className={
          overlay ? styles.genealogyOverlayEdge : styles.genealogyTreeEdge
        }
        data-kind={relation.kind}
        d={`M ${startX} ${startY} C ${startX} ${middleY}, ${endX} ${middleY}, ${endX} ${endY}`}
      />
    );
  };

  return (
    <section className={styles.genealogyCanvasPanel} aria-label="语言谱系图">
      <div className={styles.genealogyToolbar}>
        <div className={styles.zoomControls}>
          <button
            type="button"
            aria-label="缩小谱系图"
            onClick={() => zoom(1 / 1.15)}
          >
            <MinusIcon aria-hidden="true" />
          </button>
          <output aria-label="当前缩放比例">
            {Math.round(view.scale * 100)}%
          </output>
          <button
            type="button"
            aria-label="放大谱系图"
            onClick={() => zoom(1.15)}
          >
            <PlusIcon aria-hidden="true" />
          </button>
          <button type="button" onClick={fit}>
            <EnterFullScreenIcon aria-hidden="true" />
            适合窗口
          </button>
        </div>
        <div className={styles.genealogyLayers} aria-label="关系图层">
          {Boolean(props.evolutionMarkers?.length) && (
            <span className={styles.genealogyEvolutionCount}>
              演化提交 <small>{props.evolutionMarkers?.length}</small>
            </span>
          )}
          {contactCount > 0 && (
            <button
              type="button"
              data-active={showContact}
              aria-pressed={showContact}
              onClick={() => setShowContact((value) => !value)}
            >
              接触 <small>{contactCount}</small>
            </button>
          )}
          {dialectCount > 0 && (
            <button
              type="button"
              data-active={showDialect}
              aria-pressed={showDialect}
              onClick={() => setShowDialect((value) => !value)}
            >
              方言 <small>{dialectCount}</small>
            </button>
          )}
          <button
            type="button"
            aria-label="查看谱系图帮助"
            aria-expanded={helpOpen}
            onClick={() => setHelpOpen((value) => !value)}
          >
            <QuestionMarkCircledIcon aria-hidden="true" />
          </button>
        </div>
      </div>
      {helpOpen && (
        <div
          className={styles.genealogyHelp}
          role="dialog"
          aria-label="谱系图操作说明"
        >
          <strong>画布操作</strong>
          <span>
            滚轮缩放；按住 Ctrl
            并拖动查看；双击语言进入其工作区。语言关系在“基本属性”中维护。
          </span>
        </div>
      )}
      <div
        ref={viewportRef}
        className={styles.genealogyViewport}
        data-dragging={Boolean(dragRef.current)}
        onWheel={onWheel}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={stopDragging}
        onPointerCancel={stopDragging}
      >
        {!props.languages.length ? (
          <div className={styles.genealogyEmpty}>
            <strong>项目中还没有语言</strong>
          </div>
        ) : (
          <svg width="100%" height="100%" role="img" aria-label="语言继承树">
            <g
              transform={`translate(${view.x} ${view.y}) scale(${view.scale})`}
            >
              <g className={styles.genealogyEdges}>
                {inheritanceEdges.map((relation) => edge(relation))}
                {overlayEdges.map((relation) => edge(relation, true))}
              </g>
              <g className={styles.genealogyEvolutionMarkers}>
                {(props.evolutionMarkers ?? []).map((marker, index) => {
                  const position = markerPosition(marker, index);
                  if (!position) return null;
                  return (
                    <g
                      key={marker.deliveryId}
                      transform={`translate(${position.x} ${position.y})`}
                      role="button"
                      tabIndex={0}
                      aria-label={`${marker.planName}，版本 ${marker.versionNumber}，${marker.changed} 个词发生变化`}
                      onClick={() => props.onOpenEvolutionMarker?.(marker)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          props.onOpenEvolutionMarker?.(marker);
                        }
                      }}
                    >
                      <circle r="8" />
                      <text y="3" textAnchor="middle">
                        {marker.warnings ? "!" : "●"}
                      </text>
                    </g>
                  );
                })}
              </g>
              {layout.nodes.map((node) => {
                const isExpanded = expanded.has(node.id);
                const hasStages = node.stages.length > 0;
                return (
                  <g
                    key={node.id}
                    className={styles.genealogyNode}
                    data-selected={selectedId === node.id}
                    transform={`translate(${node.x} ${node.y})`}
                    role="button"
                    tabIndex={0}
                    aria-label={`${node.language.name}${
                      hasStages ? `，${node.stages.length} 个历史阶段` : ""
                    }`}
                    onClick={() => setSelectedId(node.id)}
                    onDoubleClick={() => props.onOpenLanguage?.(node.id)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter")
                        props.onOpenLanguage?.(node.id);
                      if (event.key === " " && hasStages) {
                        event.preventDefault();
                        setExpanded((current) => toggleSet(current, node.id));
                      }
                    }}
                  >
                    <rect
                      className={styles.genealogyNodeBody}
                      width={node.width}
                      height={node.height}
                      rx="4"
                    />
                    <rect
                      className={styles.genealogyAvatar}
                      x="10"
                      y="10"
                      width="30"
                      height="30"
                      rx="4"
                    />
                    <text
                      className={styles.genealogyAvatarText}
                      x="25"
                      y="30"
                      textAnchor="middle"
                    >
                      {node.language.name.slice(0, 1)}
                    </text>
                    <text className={styles.genealogyNodeTitle} x="50" y="24">
                      {node.language.name}
                    </text>
                    <text className={styles.genealogyNodeMeta} x="50" y="42">
                      {hasStages
                        ? `${node.stages.length} 个历史阶段`
                        : "单一状态"}
                    </text>
                    {hasStages && (
                      <g
                        className={styles.genealogyStageToggle}
                        onClick={(event) => {
                          event.stopPropagation();
                          setExpanded((current) => toggleSet(current, node.id));
                        }}
                      >
                        <rect
                          x={node.width - 28}
                          y="15"
                          width="18"
                          height="18"
                          rx="3"
                        />
                        <text x={node.width - 19} y="28" textAnchor="middle">
                          {isExpanded ? "−" : "+"}
                        </text>
                      </g>
                    )}
                    {isExpanded &&
                      node.stages.map((stage, index) => (
                        <g
                          key={stage.id}
                          className={styles.genealogyStageRow}
                          transform={`translate(0 ${
                            NODE_HEIGHT + index * STAGE_HEIGHT
                          })`}
                          onClick={(event) => {
                            event.stopPropagation();
                            props.onOpenStage?.(node.id, stage.id);
                          }}
                        >
                          <line x1="10" x2={node.width - 10} y1="0" y2="0" />
                          <circle cx="17" cy="13" r="3" />
                          <text x="28" y="17">
                            {stage.name}
                          </text>
                          <text x={node.width - 10} y="17" textAnchor="end">
                            {[stage.startLabel, stage.endLabel]
                              .filter(Boolean)
                              .join("—")}
                          </text>
                        </g>
                      ))}
                  </g>
                );
              })}
            </g>
          </svg>
        )}
      </div>
    </section>
  );
}

function toggleSet(source: Set<string>, value: string) {
  const next = new Set(source);
  if (next.has(value)) next.delete(value);
  else next.add(value);
  return next;
}
