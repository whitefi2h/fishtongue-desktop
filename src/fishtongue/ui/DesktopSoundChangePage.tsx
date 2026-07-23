import SoundChangeService from "@/fishtongue/application/services/SoundChangeService";
import styles from "@/fishtongue/ui/DesktopSoundChangePage.module.css";
import ScCodeEditor from "@/sc/ScCodeEditor";
import Head from "next/head";
import { useState } from "react";

const EXAMPLE_SOUND_CHANGES = `# Phase 0：CodeMirror / Lezer 桌面验证
class vowel {a, e, i, o, u}

palatalization:
  k => ʃ / _ i

vowel-raising:
  a => e / _ i`;

export default function DesktopSoundChangePage({
  soundChangeService,
}: {
  soundChangeService: SoundChangeService;
}) {
  const engineStatus = soundChangeService.getEngineStatus();
  const [characterCount, setCharacterCount] = useState(
    EXAMPLE_SOUND_CHANGES.length
  );

  return (
    <>
      <Head>
        <title>FishTongue · Phase 0</title>
        <meta
          name="description"
          content="FishTongue 桌面壳与音变规则编辑器验证"
        />
      </Head>
      <div className={styles.shell}>
        <header className={styles.header}>
          <div>
            <p className={styles.eyebrow}>FISHTONGUE DESKTOP</p>
            <h1>音变规则编辑器</h1>
            <p className={styles.subtitle}>Phase 0 桌面壳验证版</p>
          </div>
          <span className={styles.phaseBadge}>PHASE 0</span>
        </header>

        <main className={styles.workspace}>
          <section className={styles.editorPanel}>
            <div className={styles.panelHeader}>
              <div>
                <h2>Lexurgy 规则</h2>
                <p>已复用上游 CodeMirror 编辑器与 Lezer 语法高亮。</p>
              </div>
              <span>{characterCount} 字符</span>
            </div>
            <div className={styles.editorFrame}>
              <ScCodeEditor
                initialCode={EXAMPLE_SOUND_CHANGES}
                onUpdateCode={(soundChanges) =>
                  setCharacterCount(soundChanges.length)
                }
                height="100%"
              />
            </div>
          </section>

          <aside className={styles.statusPanel} aria-label="引擎状态">
            <p className={styles.statusLabel}>ENGINE STATUS</p>
            <div className={styles.statusRow}>
              <span
                className={styles.statusDot}
                data-state={engineStatus.state}
              />
              <strong>
                {engineStatus.state === "ready" ? "引擎就绪" : "尚未接入"}
              </strong>
            </div>
            <p>{engineStatus.message}</p>
            <div className={styles.boundaryNote}>
              <strong>本阶段可验收</strong>
              <ul>
                <li>输入、选择与滚动</li>
                <li>行号和语法高亮</li>
                <li>括号补全、撤销与重做</li>
              </ul>
            </div>
            <p className={styles.honestyNote}>
              当前不会发送网络请求，也不会伪造规则校验或音变结果。
            </p>
          </aside>
        </main>
      </div>
    </>
  );
}
